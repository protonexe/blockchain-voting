const fs = require('fs');
const path = require('path');

async function main() {
  const Voting = await ethers.getContractFactory("Voting");
  const candidates = ["Alice", "Bob", "Charlie"]; // Change as needed
  const voting = await Voting.deploy(candidates);
  await voting.waitForDeployment(); // <-- Ethers v6 syntax
  console.log("Voting deployed to:", voting.target); // <-- Ethers v6 uses .target

  // Write the address to a file in the Hardhat project
  fs.writeFileSync('deployedAddress.json', JSON.stringify({ address: voting.target }, null, 2));

  // Copy the file to the src folder (since src is in the root)
  const dest = path.join(__dirname, '..','frontend', 'src', 'deployedAddress.json');
  fs.copyFileSync('deployedAddress.json', dest);
  console.log(`Copied deployedAddress.json to ${dest}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});