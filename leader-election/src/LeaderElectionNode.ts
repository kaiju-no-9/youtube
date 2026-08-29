import { NodeRole, MessageType, NodeMessage, NodeConfig } from './types.js';

export type SendMessageFn = (msg: NodeMessage) => void;
export type LogHandlerFn = (nodeId: number, role: NodeRole, message: string) => void;

export class LeaderElectionNode {
  public readonly id: number;
  public role: NodeRole = NodeRole.FOLLOWER;
  public leaderId: number | null = null;
  public knownPeers: Set<number> = new Set();

  private heartbeatIntervalMs: number;
  private heartbeatTimeoutMs: number;
  private electionTimeoutMs: number;

  private heartbeatTimer: NodeJS.Timeout | null = null;
  private heartbeatWatchdogTimer: NodeJS.Timeout | null = null;
  private electionTimer: NodeJS.Timeout | null = null;

  private receivedAckInCurrentElection: boolean = false;
  private sendMessageFn: SendMessageFn;
  private logFn: LogHandlerFn;

  constructor(config: NodeConfig, sendMessage: SendMessageFn, onLog?: LogHandlerFn) {
    this.id = config.id;
    this.heartbeatIntervalMs = config.heartbeatIntervalMs ?? 1000;
    this.heartbeatTimeoutMs = config.heartbeatTimeoutMs ?? 2500;
    this.electionTimeoutMs = config.electionTimeoutMs ?? 1500;
    this.sendMessageFn = sendMessage;
    this.logFn = onLog ?? ((id, role, msg) => console.log(`[Node ${id}] [${role}] ${msg}`));
  }

  public log(msg: string): void {
    this.logFn(this.id, this.role, msg);
  }

  public start(peers: number[] = []): void {
    this.role = NodeRole.FOLLOWER;
    peers.forEach(p => {
      if (p !== this.id) this.knownPeers.add(p);
    });

    this.log(`Started node with peers: [${Array.from(this.knownPeers).join(', ')}]`);

    // Announce presence to peers
    this.broadcast({
      type: MessageType.ANNOUNCE,
      senderId: this.id,
    });

    // Start watching for leader heartbeats
    this.resetHeartbeatWatchdog();

    // Trigger election after initial random startup delay to discover/establish leader
    const randomStartupDelay = Math.floor(Math.random() * 500) + 200;
    setTimeout(() => {
      if (this.role !== NodeRole.DEAD && this.leaderId === null) {
        this.log(`No initial leader known. Initiating startup election...`);
        this.startElection();
      }
    }, randomStartupDelay);
  }

  public stop(): void {
    this.role = NodeRole.DEAD;
    this.clearAllTimers();
    this.log(`🔴 Node shut down / terminated.`);
  }

  public selfKill(): void {
    this.log(`💥 Executing self-kill! Terminating node thread/process...`);
    this.stop();
  }

  public addPeer(peerId: number): void {
    if (peerId !== this.id && !this.knownPeers.has(peerId)) {
      this.knownPeers.add(peerId);
      this.log(`Added new peer Node ${peerId}`);
    }
  }

  public removePeer(peerId: number): void {
    this.knownPeers.delete(peerId);
  }

  public startElection(): void {
    if (this.role === NodeRole.DEAD) return;

    this.clearAllTimers();
    this.role = NodeRole.CANDIDATE;
    this.leaderId = null;
    this.receivedAckInCurrentElection = false;

    const higherPeers = Array.from(this.knownPeers).filter(peerId => peerId > this.id);
    this.log(`⚡ Initiating ELECTION (Bully algorithm). Higher peers: [${higherPeers.join(', ')}]`);

    if (higherPeers.length === 0) {
      // No higher ID peers available -> I am the highest ID node -> I win!
      this.log(`No higher active peers exist. Claiming leadership victory!`);
      this.becomeLeader();
      return;
    }

    // Send ELECTION message to all higher ID peers
    for (const higherId of higherPeers) {
      this.sendMessageFn({
        type: MessageType.ELECTION,
        senderId: this.id,
        targetId: higherId,
      });
    }

    // Set election timeout timer to wait for ELECTION_ACK
    this.electionTimer = setTimeout(() => {
      if (this.role === NodeRole.CANDIDATE) {
        if (!this.receivedAckInCurrentElection) {
          this.log(`No higher peer responded to ELECTION message within ${this.electionTimeoutMs}ms. Becoming LEADER.`);
          this.becomeLeader();
        } else {
          this.log(`Waiting for higher node to send COORDINATOR announcement...`);
          // Wait additional period for coordinator message, else retry election
          this.electionTimer = setTimeout(() => {
            if (this.role === NodeRole.CANDIDATE && this.leaderId === null) {
              this.log(`Higher node timed out sending COORDINATOR. Retrying election!`);
              this.startElection();
            }
          }, this.electionTimeoutMs);
        }
      }
    }, this.electionTimeoutMs);
  }

  private becomeLeader(): void {
    if (this.role === NodeRole.DEAD) return;

    this.clearAllTimers();
    this.role = NodeRole.LEADER;
    this.leaderId = this.id;
    this.log(`👑 *** I HAVE BEEN ELECTED LEADER *** 👑`);

    // Broadcast COORDINATOR message to all peers
    this.broadcast({
      type: MessageType.COORDINATOR,
      senderId: this.id,
    });

    // Start periodic heartbeat broadcast
    this.sendHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, this.heartbeatIntervalMs);
  }

  private sendHeartbeat(): void {
    if (this.role !== NodeRole.LEADER) return;
    this.broadcast({
      type: MessageType.HEARTBEAT,
      senderId: this.id,
    });
  }

  public handleMessage(msg: NodeMessage): void {
    if (this.role === NodeRole.DEAD) return;

    // Register sender as known peer
    if (msg.senderId !== this.id) {
      this.addPeer(msg.senderId);
    }

    switch (msg.type) {
      case MessageType.ANNOUNCE:
        if (this.role === NodeRole.LEADER) {
          // If we are leader, send coordinator message to the newcomer
          this.sendMessageFn({
            type: MessageType.COORDINATOR,
            senderId: this.id,
            targetId: msg.senderId,
          });
        } else if (msg.senderId > this.id && this.role === NodeRole.FOLLOWER) {
          // If newcomer has higher ID, let's see if we need an election
          this.log(`Discovered newcomer Node ${msg.senderId} with higher ID.`);
        }
        break;

      case MessageType.ELECTION:
        if (msg.senderId < this.id) {
          this.log(`Received ELECTION request from lower Node ${msg.senderId}. Sending ELECTION_ACK.`);
          this.sendMessageFn({
            type: MessageType.ELECTION_ACK,
            senderId: this.id,
            targetId: msg.senderId,
          });

          // Kick off our own election if we are not already candidate or leader
          if (this.role !== NodeRole.LEADER && this.role !== NodeRole.CANDIDATE) {
            this.startElection();
          }
        }
        break;

      case MessageType.ELECTION_ACK:
        if (this.role === NodeRole.CANDIDATE && msg.senderId > this.id) {
          this.log(`Received ELECTION_ACK from higher Node ${msg.senderId}. Yielding election.`);
          this.receivedAckInCurrentElection = true;
        }
        break;

      case MessageType.COORDINATOR:
        if (msg.senderId < this.id) {
          this.log(`Received COORDINATOR from lower Node ${msg.senderId}. Initiating election takeover!`);
          this.startElection();
        } else {
          this.clearAllTimers();
          this.leaderId = msg.senderId;
          this.role = NodeRole.FOLLOWER;
          this.log(`Acknowledged Node ${msg.senderId} as new LEADER. Role set to FOLLOWER.`);
          this.resetHeartbeatWatchdog();
        }
        break;

      case MessageType.HEARTBEAT:
        if (msg.senderId < this.id && this.role !== NodeRole.LEADER) {
          this.log(`Received HEARTBEAT from lower Leader Node ${msg.senderId}. Initiating election takeover!`);
          this.startElection();
        } else if (this.leaderId === null || msg.senderId === this.leaderId) {
          this.leaderId = msg.senderId;
          if (this.role !== NodeRole.LEADER) {
            this.role = NodeRole.FOLLOWER;
          }
          this.resetHeartbeatWatchdog();
        } else if (msg.senderId > (this.leaderId ?? 0)) {
          this.leaderId = msg.senderId;
          this.role = NodeRole.FOLLOWER;
          this.resetHeartbeatWatchdog();
        }
        break;

      case MessageType.KILL:
        this.selfKill();
        break;

      default:
        break;
    }
  }

  private resetHeartbeatWatchdog(): void {
    if (this.role === NodeRole.LEADER || this.role === NodeRole.DEAD) return;

    if (this.heartbeatWatchdogTimer) {
      clearTimeout(this.heartbeatWatchdogTimer);
    }

    this.heartbeatWatchdogTimer = setTimeout(() => {
      if (this.role === NodeRole.FOLLOWER) {
        this.log(` Heartbeat TIMEOUT! Leader Node ${this.leaderId ?? 'UNKNOWN'} failed to respond within ${this.heartbeatTimeoutMs}ms.`);
        this.startElection();
      }
    }, this.heartbeatTimeoutMs);
  }

  private broadcast(msg: NodeMessage): void {
    this.sendMessageFn(msg);
  }

  private clearAllTimers(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.heartbeatWatchdogTimer) {
      clearTimeout(this.heartbeatWatchdogTimer);
      this.heartbeatWatchdogTimer = null;
    }
    if (this.electionTimer) {
      clearTimeout(this.electionTimer);
      this.electionTimer = null;
    }
  }
}
