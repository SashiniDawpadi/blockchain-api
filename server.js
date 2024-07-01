const express = require('express');
const {Web3} = require('web3');
const fs = require('fs');
require('dotenv').config();

const app = express();
const port = 3000;

// Initialize Web3 with Infura endpoint
const web3 = new Web3(`https://polygon-amoy.infura.io/v3/${process.env.INFURA_PROJECT_ID}`);
const contractABI = [
	{
		"inputs": [
			{
				"internalType": "string[]",
				"name": "newData",
				"type": "string[]"
			}
		],
		"name": "addData",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"internalType": "string",
				"name": "data",
				"type": "string"
			}
		],
		"name": "DataAdded",
		"type": "event"
	},
	{
		"inputs": [],
		"name": "getAllData",
		"outputs": [
			{
				"internalType": "string[]",
				"name": "",
				"type": "string[]"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "index",
				"type": "uint256"
			}
		],
		"name": "getData",
		"outputs": [
			{
				"internalType": "string",
				"name": "",
				"type": "string"
			}
		],
		"stateMutability": "view",
		"type": "function"
	}
];
const contractAddress = process.env.CONTRACT_ADDRESS;
const privateKey = process.env.PRIVATE_KEY;

// Add account using private key
const account = web3.eth.accounts.privateKeyToAccount(privateKey);
web3.eth.accounts.wallet.add(account);

// Initialize contract instance
const contract = new web3.eth.Contract(contractABI, contractAddress);

app.use(express.json());

function bigintReplacer(key, value) {
    if (typeof value === 'bigint') {
        return value.toString(); // Convert BigInt to string
    }
    return value;
}

function writeDataToFile(data, filename = 'data.json') {
    fs.appendFile(filename, JSON.stringify(data, bigintReplacer) + '\n', (err) => {
        if (err) {
            console.error('Error writing to file', err);
        } else {
            console.log('Data successfully written to file');
        }
    });
}

// Endpoint to add data to the contract
app.post('/addData', async (req, res) => {
    const { data } = req.body;
	writeDataToFile(data);
    try {
		// const gasPrice = await web3.eth.getGasPrice();
        const receipt = await contract.methods.addData(data).send({
            from: account.address,
            gas: 3000000,
			// gasPrice: gasPrice * 2 
        });
        res.send(JSON.stringify(receipt, bigintReplacer));
    } catch (error) {
        console.error(error);
        res.status(500).send('Error adding data to contract');
    }
});


// Endpoint to get data from the contract by index
app.get('/getData/:index', async (req, res) => {
    const { index } = req.params;
    try {
        const data = await contract.methods.getData(index).call();
        res.send(data);
    } catch (error) {
        console.error(error);
        res.status(500).send('Error getting data from contract');
    }
});

// Endpoint to get all data from the contract
app.get('/getAllData', async (req, res) => {
    try {
        const data = await contract.methods.getAllData().call();
        res.send(JSON.stringify(data, bigintReplacer));
    } catch (error) {
        console.error(error);
        res.status(500).send('Error getting all data from contract');
    }
});

app.listen(port, () => {

    console.log(`Server listening at http://localhost:${port}`);
});
