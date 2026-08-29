import { ClusterManager, colors } from './ClusterManager.js';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runLeaderElectionDemo() {
  console.log(`\n========================================================================`);
  console.log(`${colors.bright}${colors.cyan}    LEADER ELECTION ALGORITHM DEMO (BULLY ALGORITHM IN TYPESCRIPT)${colors.reset}`);
  console.log(`========================================================================\n`);

  const cluster = new ClusterManager({
    heartbeatIntervalMs: 800,
    heartbeatTimeoutMs: 2000,
    electionTimeoutMs: 1200,
  });

  // STEP 1: Spin up initial cluster of worker nodes
  console.log(`${colors.bright}🚀 STEP 1: Spinning up initial cluster with 4 worker nodes (IDs: 10, 20, 30, 40)...${colors.reset}\n`);
  
  cluster.spawnNode(10);
  await sleep(100);
  cluster.spawnNode(20);
  await sleep(100);
  cluster.spawnNode(30);
  await sleep(100);
  cluster.spawnNode(40);

  // Allow nodes to run initial election and stabilize leadership
  console.log(`\n${colors.gray}⏳ Waiting for initial leader election to settle...${colors.reset}\n`);
  await sleep(2500);

  const initialLeader = cluster.getCurrentLeader();
  console.log(`\n${colors.bright}${colors.green}✔ Initial Leader Established: Node ${initialLeader?.id}${colors.reset}`);
  
  // STEP 2: Let leader send heartbeats for 3 seconds
  console.log(`\n${colors.bright}⏱️  STEP 2: Observing active leader broadcasting heartbeats...${colors.reset}\n`);
  await sleep(3000);

  // STEP 3: Master/Leader thread self-kill!
  console.log(`\n${colors.bright}💥 STEP 3: MASTER THREAD SELF-KILL! Terminating active Leader (Node ${initialLeader?.id})...${colors.reset}\n`);
  cluster.killLeader();

  // STEP 4: Watch heartbeat timeout kick in and re-election happen
  console.log(`\n${colors.bright}⚡ STEP 4: Followers detect missing heartbeats. Leader Election algorithm kicking in...${colors.reset}\n`);
  await sleep(3500);

  const secondLeader = cluster.getCurrentLeader();
  console.log(`\n${colors.bright}${colors.green}✔ New Leader Elected After Master Failure: Node ${secondLeader?.id}${colors.reset}\n`);

  // STEP 5: Dynamic worker node spin-up!
  console.log(`${colors.bright}✨ STEP 5: Dynamic Worker Spin-Up! A new node (Node 50) spins itself up...${colors.reset}\n`);
  cluster.spawnNode(50);

  // Wait for Node 50 to announce, initiate election, and take over leadership
  await sleep(3000);

  const finalLeader = cluster.getCurrentLeader();
  console.log(`\n${colors.bright}${colors.green}✔ Final Leader After Dynamic Worker Join: Node ${finalLeader?.id}${colors.reset}\n`);

  // STEP 6: Graceful shutdown
  console.log(`\n========================================================================`);
  console.log(`${colors.bright}${colors.magenta}    DEMO COMPLETE - SHUTTING DOWN CLUSTER MANAGER${colors.reset}`);
  console.log(`========================================================================\n`);

  cluster.stopAll();
  process.exit(0);
}

runLeaderElectionDemo().catch(err => {
  console.error("Demo failed with error:", err);
  process.exit(1);
});
