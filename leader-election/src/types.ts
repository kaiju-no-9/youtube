export enum NodeRole {
  FOLLOWER = 'FOLLOWER',
  CANDIDATE = 'CANDIDATE',
  LEADER = 'LEADER',
  DEAD = 'DEAD',
}

export enum MessageType {
  ELECTION = 'ELECTION',
  ELECTION_ACK = 'ELECTION_ACK',
  COORDINATOR = 'COORDINATOR',
  HEARTBEAT = 'HEARTBEAT',
  HEARTBEAT_ACK = 'HEARTBEAT_ACK',
  ANNOUNCE = 'ANNOUNCE',
  KILL = 'KILL',
}

export interface NodeMessage {
  type: MessageType;
  senderId: number;
  targetId?: number; // If targetId is undefined, message is broadcasted
  term?: number;
  payload?: any;
}

export interface NodeConfig {
  id: number;
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  electionTimeoutMs?: number;
}

export interface NodeLogEvent {
  timestamp: string;
  nodeId: number;
  role: NodeRole;
  message: string;
}
