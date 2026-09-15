import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

/** A local chain only. `npm run node` serves chain id 31337 on 127.0.0.1:8545 with funded accounts. */
const config: HardhatUserConfig = {
  solidity: { version: "0.8.28", settings: { optimizer: { enabled: true, runs: 200 } } },
  networks: { hardhat: { chainId: 31337 }, localhost: { url: "http://127.0.0.1:8545" } },
  paths: { sources: "./contracts", tests: "./test", cache: "./cache", artifacts: "./artifacts" },
  typechain: { outDir: "typechain-types", target: "ethers-v6" },
  sourcify: { enabled: false },
};

export default config;
