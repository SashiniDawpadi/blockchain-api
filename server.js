const express = require("express");
const axios = require("axios");
const { Web3 } = require("web3");
const fs = require("fs");
require("dotenv").config();

const app = express();
const port = 3000;

// Initialize Web3 with Infura endpoint
const web3 = new Web3(
  `https://polygon-amoy.infura.io/v3/${process.env.INFURA_PROJECT_ID}`
);
const contractABI = [
  {
    inputs: [
      {
        internalType: "string[]",
        name: "newData",
        type: "string[]",
      },
    ],
    name: "addData",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "string",
        name: "data",
        type: "string",
      },
      {
        indexed: false,
        internalType: "bytes32",
        name: "txHash",
        type: "bytes32",
      },
    ],
    name: "DataAdded",
    type: "event",
  },
  {
    inputs: [],
    name: "getAllData",
    outputs: [
      {
        internalType: "string[]",
        name: "",
        type: "string[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "index",
        type: "uint256",
      },
    ],
    name: "getData",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "txHash",
        type: "bytes32",
      },
    ],
    name: "getDataByTxHash",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
];
const contractAddress = process.env.CONTRACT_ADDRESS;
const privateKey = process.env.PRIVATE_KEY;

const account = web3.eth.accounts.privateKeyToAccount(privateKey);
web3.eth.accounts.wallet.add(account);

const contract = new web3.eth.Contract(contractABI, contractAddress);

app.use(express.json());

function bigintReplacer(key, value) {
  if (typeof value === "bigint") {
    return value.toString();
  }
  return value;
}

function writeDataToFile(data, filename = "data.json") {
  fs.appendFile(
    filename,
    JSON.stringify(data, bigintReplacer) + "\n",
    (err) => {
      if (err) {
        console.error("Error writing to file", err);
      } else {
        console.log("Data successfully written to file");
      }
    }
  );
}

const FLASK_API_URL =
  "https://89a8-2402-4000-20c2-6761-19ef-d19-a87b-da86.ngrok-free.app";

app.post("/predict-gasprice", async (req, res) => {
  try {
    const latestBlock = await web3.eth.getBlockNumber();
    console.log(latestBlock);

    const oneMinuteBlocks = 5; // Approximate number of blocks mined in a minute on Ethereum
    const startBlock = Number(latestBlock) - oneMinuteBlocks;

    let totalBlockRewards = 0;
    let totalBlockSize = 0;
    let totalGasUsed = 0;
    let totalTransactions = 0;
    let blockCount = 0;

    async function getBlocksBatch(start, end) {
      const blockPromises = [];
      for (let i = start; i <= end; i++) {
        blockPromises.push(web3.eth.getBlock(i, true));
      }
      return Promise.all(blockPromises);
    }
    const blocks = await getBlocksBatch(startBlock, latestBlock);

    // Process the blocks
    for (let block of blocks) {
      if (!block) continue; // Skip if block is null
      const blockReward = 2; // Base block reward after Constantinople fork
      // Check if block.transactions is an array
      if (Array.isArray(block.transactions)) {
        // Sum up the transaction fees (priority fees/tips)
        let transactionFees = 0;
        for (let tx of block.transactions) {
          const receipt = await web3.eth.getTransactionReceipt(tx.hash);
          const gasUsed = receipt.gasUsed;
          const gasPrice = tx.gasPrice;
          const txFee = BigInt(gasUsed) * BigInt(gasPrice);
          transactionFees += Number(txFee);
        }
        // Convert transaction fees from wei to ETH
        transactionFees = Number(
          web3.utils.fromWei(transactionFees.toString(), "ether")
        );
        totalBlockRewards += blockReward + transactionFees;
        totalTransactions += block.transactions.length;
      } else {
        totalBlockRewards += blockReward; // Only add base block reward if no transactions
      }
      totalBlockSize += Number(block.size);
      totalGasUsed += Number(block.gasUsed);
      blockCount++;
    }

    totalBlockRewards = totalBlockRewards * 60 * 24;
    totalTransactions = totalTransactions * 60 * 24;
    totalGasUsed = totalGasUsed * 60 * 24;

    // Calculate the average block size
    const avgBlockSize = totalBlockSize / blockCount;

    //average difficulty in TH/s
    const avgDifficulty =
      Number((await web3.eth.getBlock(latestBlock)).difficulty) / 1e12;

    // average hashrate in TH/s
    blockCount = blockCount * 60 * 24;
    const avgHashrate = (avgDifficulty * blockCount * 1e12) / 60;

    //ETH average price in the last 1 minute
    const ethPrice = await getEthPrice();

    const metrics = {
      features: {
        Difficulty: avgDifficulty,
        BlockRewards: totalBlockRewards,
        BlockSize: avgBlockSize,
        HashRate: avgHashrate,
        TransactionCount: totalTransactions,
        PricePerUnit: ethPrice,
        DailyGasUsage: totalGasUsed,
      },
    };

    console.log(metrics)

    const response = await axios.post(FLASK_API_URL, metrics);
    console.log(response);
    const prediction = response.data.prediction;
    res.json({ prediction });
  } catch (error) {
    // console.error("Error making prediction:", error);
    res.status(500).json({ error: "Failed to get prediction" });
  }
});

async function getEthPrice() {
  const response = await axios.get(
    "https://api.coingecko.com/api/v3/coins/ethereum"
  );
  const ethPrice = response.data.market_data.current_price.usd;
  return ethPrice;
}

// Endpoint to add data to the contract
app.post("/addData", async (req, res) => {
  const { data } = req.body;
  // writeDataToFile(data);
  try {
    const gasPrice = await web3.eth.getGasPrice();
    const receipt = await contract.methods.addData(data).send({
      from: account.address,
      gas: 3000000,
      gasPrice: gasPrice,
    });
    res.send(JSON.stringify(receipt, bigintReplacer));
  } catch (error) {
    console.error(error);
    res.status(500).send("Error adding data to contract");
  }
});

// Endpoint to get data from the contract by index
app.get("/getData/:index", async (req, res) => {
  const { index } = req.params;
  try {
    const data = await contract.methods.getData(index).call();
    res.send(data);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error getting data from contract");
  }
});

app.get("/getDataByTxHash/:txHash", async (req, res) => {
  try {
    const { txHash } = req.params;
    const data = await contract.methods.getDataByTxHash(txHash).call();
    res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

// Endpoint to get all data from the contract
app.get("/getAllData", async (req, res) => {
  try {
    const data = await contract.methods.getAllData().call();
    res.send(JSON.stringify(data, bigintReplacer));
  } catch (error) {
    console.error(error);
    res.status(500).send("Error getting all data from contract");
  }
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
