# 👑 Distributed Leader Election in TypeScript

A lightweight, robust implementation and testbed for the **Bully Leader Election Algorithm** built with TypeScript and Node.js. 

This project demonstrates **distributed consensus and leader failover**, allowing worker nodes to dynamically spin themselves up, establish leadership, detect master/leader thread crashes via heartbeat monitoring, and automatically trigger re-elections.

---

## 🎯 Features

- **Bully Leader Election Algorithm**: Priority-based deterministic leader election (Node with highest active ID wins).
- **Heartbeat & Failover Monitoring**: Active Leader sends periodic heartbeats. Followers monitor heartbeat timeouts.
- **Master Thread Self-Kill Simulation**: Simulates crash or intentional self-termination of the master/leader thread.
- **Dynamic Worker Spin-Up**: New worker threads/nodes can dynamically launch at any time, join the cluster, announce presence, and trigger leadership takeovers if appropriate.
- **Visual Log Output**: ANSI colored terminal logging with clear timestamps and role indicators (`👑 LEADER`, `⚡ CANDIDATE`, `🔹 FOLLOWER`, `💀 DEAD`).
- **Automated Test Suite**: Full integration test suite using Vitest for automated verification.

---

## 🏗️ Architecture & How It Works

### The Bully Algorithm Logic

1. **Initialization / Discovery**:
   - Each node is assigned a unique numeric ID (e.g. `10`, `20`, `30`, `40`, `50`).
   - Higher IDs indicate higher priority.

2. **Leader Heartbeats**:
   - The active Leader broadcasts `HEARTBEAT` messages every `heartbeatIntervalMs` (default: 800ms - 1000ms).
   - Followers reset their internal watchdog timer whenever a `HEARTBEAT` arrives from the recognized leader.

3. **Leader Failure & Heartbeat Timeout**:
   - If a Follower does not receive a `HEARTBEAT` within `heartbeatTimeoutMs` (e.g. 2000ms), it infers that the Leader has crashed (or killed itself).
   - The Follower transitions to `CANDIDATE` state and initiates an `ELECTION`.

4. **Election Protocol**:
   - Candidate sends an `ELECTION` message to all known nodes with a **higher ID**.
   - If a higher node receives `ELECTION`, it replies with `ELECTION_ACK` and starts its own election.
   - If **no higher node responds** within `electionTimeoutMs`, the Candidate declares victory:
     - Transitions to `LEADER` role (`👑`).
     - Broadcasts `COORDINATOR` message to all nodes.
     - Resumes sending periodic heartbeats.

5. **Dynamic Worker Spin-Up**:
   - When a new worker node spins up (e.g. Node `50`), it broadcasts an `ANNOUNCE` message and starts an election.
   - Since `50` > current leader (e.g. `30`), Node `50` bullies takeover and becomes the new `LEADER`.

---

## 🚀 Quick Start & Setup

### Prerequisites
- **Node.js**: v18+ (tested on Node v25.1.0)
- **npm**: v9+

### 1. Installation

Install dependencies:
```bash
npm install
```

---

## 🎬 Running the Interactive CLI Demo

Run the interactive demonstration script:

```bash
npm start
```

### What you will observe in the demo:
1. **Initial Spin-Up**: Nodes 10, 20, 30, and 40 spin up.
2. **Initial Leader Election**: Node `40` (highest ID) wins and becomes `LEADER` (`👑`).
3. **Heartbeat Broadcast**: Node 40 sends periodic heartbeats to Nodes 10, 20, 30.
4. **Master Thread Self-Kill**: The system commands Master Node 40 to execute self-kill (`💥`).
5. **Failover & Re-Election**: Nodes 10, 20, 30 detect missing heartbeats. Node 30 initiates election and becomes the new `LEADER`.
6. **Dynamic Worker Join**: Node 50 dynamically spins up, announces itself, and takes over as `LEADER`.

---

## 🧪 Running Automated Tests

Run the full automated test suite powered by **Vitest**:

```bash
npm test
```

### Test Coverage Includes:
- **Initial Leader Election**: Verifies highest node ID is elected initial leader.
- **Leader Failover**: Verifies next highest node takes over when leader dies.
- **Dynamic Worker Spin-Up**: Tests new node joining and taking over leadership.
- **Cascading Failures**: Tests multi-stage leader deaths down to a single remaining node.

---

## 📁 Project Structure

```
leader-election/
├── package.json               # NPM package configuration & dependencies
├── tsconfig.json              # TypeScript compiler configuration
├── README.md                  # Project documentation
├── src/
│   ├── types.ts               # Node roles, message types, interfaces
│   ├── LeaderElectionNode.ts  # Bully election state machine & heartbeat logic
│   ├── ClusterManager.ts      # Multi-node coordinator, router & colored logging
│   └── demo.ts                # Interactive demo runner script
└── tests/
    └── leader-election.test.ts # Vitest automated test suite
```

---

## 🛠️ Code Usage Example

You can easily embed or use `ClusterManager` in your own TypeScript scripts:

```typescript
import { ClusterManager } from './src/ClusterManager.js';

// Create a cluster manager with custom timeouts
const cluster = new ClusterManager({
  heartbeatIntervalMs: 1000,
  heartbeatTimeoutMs: 2500,
  electionTimeoutMs: 1500,
});

// 1. Spawn worker nodes
cluster.spawnNode(10);
cluster.spawnNode(20);
cluster.spawnNode(30);

// 2. Get active leader after election
setTimeout(() => {
  const leader = cluster.getCurrentLeader();
  console.log(`Active Leader: Node ${leader?.id}`); // Node 30

  // 3. Simulate master thread self-kill
  cluster.killLeader();
}, 2000);

// 4. Spin up a new worker dynamically later
setTimeout(() => {
  cluster.spawnNode(100); // Node 100 will take over leadership
}, 5000);
```
