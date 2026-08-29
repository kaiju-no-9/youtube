import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ClusterManager } from '../src/ClusterManager.js';
import { NodeRole } from '../src/types.js';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('Leader Election Algorithm (Bully Algorithm)', () => {
  let cluster: ClusterManager;

  beforeEach(() => {
    cluster = new ClusterManager(
      {
        heartbeatIntervalMs: 200,
        heartbeatTimeoutMs: 600,
        electionTimeoutMs: 400,
      },
      false // disable colors during unit test runs
    );
  });

  afterEach(() => {
    cluster.stopAll();
  });

  it('should elect the node with the highest ID as initial Leader', async () => {
    cluster.spawnNode(10);
    cluster.spawnNode(20);
    cluster.spawnNode(30);

    // Wait for election to complete
    await sleep(1000);

    const leader = cluster.getCurrentLeader();
    expect(leader).not.toBeNull();
    expect(leader?.id).toBe(30);
    expect(leader?.role).toBe(NodeRole.LEADER);

    // Verify other nodes are followers
    expect(cluster.getNode(10)?.role).toBe(NodeRole.FOLLOWER);
    expect(cluster.getNode(20)?.role).toBe(NodeRole.FOLLOWER);
  });

  it('should trigger re-election and select next highest node when leader dies', async () => {
    cluster.spawnNode(10);
    cluster.spawnNode(20);
    cluster.spawnNode(30);

    await sleep(1000);
    expect(cluster.getCurrentLeader()?.id).toBe(30);

    // Kill the current leader (Node 30)
    cluster.killLeader();
    expect(cluster.getNode(30)?.role).toBe(NodeRole.DEAD);

    // Wait for heartbeat timeout + re-election
    await sleep(1200);

    const newLeader = cluster.getCurrentLeader();
    expect(newLeader).not.toBeNull();
    expect(newLeader?.id).toBe(20); // Node 20 is next highest
    expect(newLeader?.role).toBe(NodeRole.LEADER);
  });

  it('should handle dynamic worker spin-up and takeover by higher ID node', async () => {
    cluster.spawnNode(10);
    cluster.spawnNode(20);

    await sleep(800);
    expect(cluster.getCurrentLeader()?.id).toBe(20);

    // Spin up a new worker node with higher ID (Node 50)
    cluster.spawnNode(50);

    // Wait for new node to announce and win election
    await sleep(1000);

    const leader = cluster.getCurrentLeader();
    expect(leader?.id).toBe(50);
    expect(leader?.role).toBe(NodeRole.LEADER);
    expect(cluster.getNode(20)?.role).toBe(NodeRole.FOLLOWER);
  });

  it('should handle cascading failures until only 1 node remains', async () => {
    cluster.spawnNode(10);
    cluster.spawnNode(20);
    cluster.spawnNode(30);

    await sleep(1000);
    expect(cluster.getCurrentLeader()?.id).toBe(30);

    // Kill leader 30
    cluster.killLeader();
    await sleep(1200);
    expect(cluster.getCurrentLeader()?.id).toBe(20);

    // Kill leader 20
    cluster.killLeader();
    await sleep(1200);

    // Node 10 must be the sole remaining leader
    expect(cluster.getCurrentLeader()?.id).toBe(10);
    expect(cluster.getNode(10)?.role).toBe(NodeRole.LEADER);
  });
});
