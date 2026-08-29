import { LeaderElectionNode } from './LeaderElectionNode.js';
import { NodeMessage, NodeRole, NodeConfig } from './types.js';

// ANSI color helpers for terminal readability
export const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

export class ClusterManager {
  private nodes: Map<number, LeaderElectionNode> = new Map();
  private defaultConfig: Partial<NodeConfig>;
  private enableColoredLogs: boolean;

  constructor(defaultConfig: Partial<NodeConfig> = {}, enableColoredLogs: boolean = true) {
    this.defaultConfig = {
      heartbeatIntervalMs: 1000,
      heartbeatTimeoutMs: 2500,
      electionTimeoutMs: 1500,
      ...defaultConfig,
    };
    this.enableColoredLogs = enableColoredLogs;
  }

  public spawnNode(id: number, customConfig: Partial<NodeConfig> = {}): LeaderElectionNode {
    if (this.nodes.has(id)) {
      const existing = this.nodes.get(id)!;
      if (existing.role !== NodeRole.DEAD) {
        throw new Error(`Node with ID ${id} is already active in the cluster.`);
      }
    }

    const config: NodeConfig = {
      id,
      ...this.defaultConfig,
      ...customConfig,
    };

    const node = new LeaderElectionNode(
      config,
      (msg: NodeMessage) => this.routeMessage(msg),
      (nodeId, role, msg) => this.logHandler(nodeId, role, msg)
    );

    this.nodes.set(id, node);

    // Collect active node IDs to pass as initial known peers
    const activePeers = Array.from(this.nodes.values())
      .filter(n => n.id !== id && n.role !== NodeRole.DEAD)
      .map(n => n.id);

    node.start(activePeers);

    // Notify all existing active nodes about the new node
    for (const [peerId, peerNode] of this.nodes.entries()) {
      if (peerId !== id && peerNode.role !== NodeRole.DEAD) {
        peerNode.addPeer(id);
      }
    }

    return node;
  }

  public killNode(id: number): boolean {
    const node = this.nodes.get(id);
    if (node && node.role !== NodeRole.DEAD) {
      this.logSystem(`💥 Command: Requesting Node ${id} to kill itself...`);
      node.selfKill();
      
      // Notify remaining nodes to remove peer
      for (const [peerId, peerNode] of this.nodes.entries()) {
        if (peerId !== id) {
          peerNode.removePeer(id);
        }
      }
      return true;
    }
    return false;
  }

  public killLeader(): number | null {
    const leader = this.getCurrentLeader();
    if (leader) {
      this.logSystem(`🚨 Command: Master/Leader Node ${leader.id} is killing itself!`);
      this.killNode(leader.id);
      return leader.id;
    } else {
      this.logSystem(`⚠️ No active leader found to kill.`);
      return null;
    }
  }

  public getCurrentLeader(): LeaderElectionNode | null {
    for (const node of this.nodes.values()) {
      if (node.role === NodeRole.LEADER) {
        return node;
      }
    }
    return null;
  }

  public getActiveNodes(): LeaderElectionNode[] {
    return Array.from(this.nodes.values()).filter(n => n.role !== NodeRole.DEAD);
  }

  public getNode(id: number): LeaderElectionNode | undefined {
    return this.nodes.get(id);
  }

  public stopAll(): void {
    this.logSystem(`Shutting down cluster manager...`);
    for (const node of this.nodes.values()) {
      node.stop();
    }
    this.nodes.clear();
  }

  private routeMessage(msg: NodeMessage): void {
    if (msg.targetId !== undefined) {
      const targetNode = this.nodes.get(msg.targetId);
      if (targetNode && targetNode.role !== NodeRole.DEAD) {
        // Direct unicast message
        setTimeout(() => targetNode.handleMessage(msg), 10);
      }
    } else {
      // Broadcast message to all peers
      for (const [peerId, peerNode] of this.nodes.entries()) {
        if (peerId !== msg.senderId && peerNode.role !== NodeRole.DEAD) {
          setTimeout(() => peerNode.handleMessage(msg), 10);
        }
      }
    }
  }

  private logHandler(nodeId: number, role: NodeRole, message: string): void {
    const time = new Date().toISOString().substring(11, 23);
    
    if (!this.enableColoredLogs) {
      console.log(`[${time}] [Node ${nodeId}] [${role}] ${message}`);
      return;
    }

    let roleColor = colors.blue;
    let icon = '🟢';

    switch (role) {
      case NodeRole.LEADER:
        roleColor = `${colors.bright}${colors.yellow}`;
        icon = '👑';
        break;
      case NodeRole.CANDIDATE:
        roleColor = `${colors.bright}${colors.cyan}`;
        icon = '⚡';
        break;
      case NodeRole.FOLLOWER:
        roleColor = colors.green;
        icon = '🔹';
        break;
      case NodeRole.DEAD:
        roleColor = colors.red;
        icon = '💀';
        break;
    }

    console.log(
      `${colors.gray}[${time}]${colors.reset} ${icon} ${roleColor}[Node ${nodeId.toString().padStart(2, ' ')}] (${role.padEnd(9, ' ')})${colors.reset} : ${message}`
    );
  }

  private logSystem(msg: string): void {
    const time = new Date().toISOString().substring(11, 23);
    if (this.enableColoredLogs) {
      console.log(`\n${colors.gray}[${time}]${colors.reset} ${colors.bright}${colors.magenta}SYSTEM: ${msg}${colors.reset}\n`);
    } else {
      console.log(`\n[${time}] SYSTEM: ${msg}\n`);
    }
  }
}
