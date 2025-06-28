// src/App.js

import React, { useEffect, useState } from 'react';
import { JsonRpcProvider, Wallet, Contract, parseEther } from 'ethers';
import AOS from 'aos';
import 'aos/dist/aos.css';
import './App.css';
import VotingABI from './abi/VotingABI.json';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import confetti from 'canvas-confetti'; // 🎉
import deployed from './deployedAddress.json';

const CONTRACT_ADDRESS = deployed.address;

// For local dev, you can hardcode the funder private key or use .env
const FUNDER_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; // <-- Use your Hardhat account PK

console.log("✅ PRIVATE KEY LOADED =", !!FUNDER_PRIVATE_KEY);

function App() {
  const [wallet, setWallet] = useState(null);
  const [provider, setProvider] = useState(null);
  const [contract, setContract] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [selectedCandidate, setSelectedCandidate] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [voteCounts, setVoteCounts] = useState({});
  const [votedFor, setVotedFor] = useState('');

  useEffect(() => {
    AOS.init({ duration: 1200, once: true });
  }, []);

  // Load votedFor from localStorage on mount
  useEffect(() => {
    const storedVote = localStorage.getItem('votedFor');
    if (storedVote) setVotedFor(storedVote);
  }, []);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        setIsLoading(true);

        if (!FUNDER_PRIVATE_KEY) {
          throw new Error('Missing FUNDER_PRIVATE_KEY in .env');
        }

        const provider = new JsonRpcProvider("http://127.0.0.1:8545");
        if (mounted) setProvider(provider);

        // Always generate a new wallet if no private key in localStorage
        let storedPk = localStorage.getItem('burnerPrivateKey');
        let burner;

        if (storedPk) {
          burner = new Wallet(storedPk).connect(provider);
        } else {
          burner = Wallet.createRandom().connect(provider);
          localStorage.setItem('burnerPrivateKey', burner.privateKey);
        }
        const nonce = await provider.getTransactionCount(burner.address); 
        console.log("Burner wallet address:", burner.address, "Nonce:", nonce);

        const balance = await provider.getBalance(burner.address);
        console.log("Burner balance before funding:", balance.toString());

        // PERMANENT FIX: Always fund if balance is zero, ignore any flag
        if (balance.toString() === "0") {
          try {
            const funder = new Wallet(FUNDER_PRIVATE_KEY, provider);
            console.log("Funding burner from funder:", funder.address, "to", burner.address);
            const tx = await funder.sendTransaction({
              to: burner.address,
              value: parseEther('0.01'),
            });
            await tx.wait();
            console.log("Funding tx complete:", tx.hash);
          } catch (fundErr) {
            console.error("Funding error:", fundErr);
          }
        } else {
          console.log("Funding not needed or already done.");
        }

        const contract = new Contract(CONTRACT_ADDRESS, VotingABI, burner);
        const list = await contract.getCandidates();
        if (mounted) {
          setWallet(burner);
          setContract(contract);
          setCandidates(list);
        }
      } catch (err) {
        console.error('Initialization error:', err);
        if (mounted) {
          setMessage(`❌ ${err.message || 'Initialization failed'}`);
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    init();

    return () => {
      mounted = false;
      setWallet(null);
      setProvider(null);
      setContract(null);
      setCandidates([]);
    };
  }, []); 

  useEffect(() => {
    if (contract && candidates.length > 0) {
      fetchVoteCounts();
    }
    // eslint-disable-next-line
  }, [contract, candidates]);

  const fetchVoteCounts = async () => {
    try {
      const results = {};
      for (let name of candidates) {
        const count = await contract.getVotes(name);
        results[name] = count.toString();
      }
      setVoteCounts(results);
    } catch (err) {
      console.error("Vote count error:", err);
    }
  };

  const handleVote = async () => {
    if (!selectedCandidate || !contract) {
      setMessage('❌ Please select a candidate and ensure contract is connected');
      return;
    }
    try {
      setMessage('⏳ Submitting vote...');

      // Estimate gas before sending
      const gasEstimate = await contract.vote.estimateGas(selectedCandidate);
      console.log("Estimated gas for vote tx:", gasEstimate.toString());

      const tx = await contract.vote(selectedCandidate);
      const receipt = await tx.wait();

      // Log actual gas used
      console.log("Gas used for vote tx:", receipt.gasUsed.toString());

      setMessage(`✅ Voted for "${selectedCandidate}" successfully!`);
      setVotedFor(selectedCandidate);
      localStorage.setItem('votedFor', selectedCandidate);
      fetchVoteCounts();

      // 🎉 Confetti animation
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    } catch (err) {
      setMessage(`❌ ${err.message || 'Vote failed.'}`);
    }
  };

  // Bulletproof reset: always generate a new wallet and clear all related data
  const resetBurner = () => {
    localStorage.removeItem('burnerPrivateKey');
    localStorage.removeItem('votedFor');
    setVotedFor('');
    window.location.reload(true);
  };

  const exportVoteLogs = async () => {
    try {
      if (!contract || !provider) {
        throw new Error('Contract or provider not initialized');
      }

      const latestBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, latestBlock - 5000);
      const logs = await contract.queryFilter(contract.filters.VoteCast(), fromBlock, latestBlock);

      const finalData = [];

      for (const log of logs) {
        const { args, blockNumber, transactionHash } = log;
        const voter = args?.voter || "N/A";
        const candidate = args?.candidate || "N/A";

        const [receipt, block] = await Promise.all([
          provider.getTransactionReceipt(transactionHash),
          provider.getBlock(blockNumber)
        ]);

        finalData.push({
          "Voter Address": voter,
          "Candidate": candidate,
          "Transaction Hash": transactionHash,
          "Block Number": blockNumber,
          "Timestamp": new Date(block.timestamp * 1000).toLocaleString(),
          "Gas Used": receipt.gasUsed.toString(),
        });
      }

      const worksheet = XLSX.utils.json_to_sheet(finalData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Votes");

      const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
      const file = new Blob([buffer], { type: "application/octet-stream" });

      saveAs(file, "BlockchainVotes.xlsx");
    } catch (err) {
      console.error("Export error:", err);
      setMessage(`❌ ${err.message || 'Failed to export vote data'}`);
    }
  };

  if (isLoading) {
    return (
      <div className="container">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="glow-bg"></div>

      <section className="hero" data-aos="fade">
        <h1><span className="gold">Blockchain Voting.</span> Reinvented.</h1>
        <p>Elegant. Immutable. Instant. Vote with full confidence—on-chain.</p>
      </section>

      <section className="chapter" data-aos="fade-up">
        <h2>Why Blockchain?</h2>
        <p>Traditional voting systems suffer from fraud, opacity, and lack of trust. Our DApp ensures every vote is secure, verifiable, and public.</p>
      </section>

      <section className="specGrid" data-aos="fade-up">
        <div><h3>🔥 Burner Wallets</h3><p>Auto-generated per user</p></div>
        <div><h3>🔐 Smart Contract</h3><p>Immutable logic on local node</p></div>
        <div><h3>🧠 React Web3</h3><p>Ethers.js + AOS.js integration</p></div>
        <div><h3>📜 Real Voting</h3><p>Votes are Ethereum transactions</p></div>
      </section>

      <section className="voteBox" data-aos="fade-up">
        {wallet && (
          <div className="wallet">
            <strong>Wallet:</strong><br />
            {wallet.address}
          </div>
        )}

        {candidates.length > 0 ? (
          <>
            <label>Select Candidate:</label>
            <select value={selectedCandidate} onChange={(e) => setSelectedCandidate(e.target.value)}>
              <option disabled value="">⬇️ Select Candidate</option>
              {candidates.map((name, idx) => (
                <option key={idx} value={name}>{name}</option>
              ))}
            </select>

            <button className="voteBtn" onClick={handleVote} disabled={!selectedCandidate}>
              ✅ Vote
            </button>
            <button className="resetBtn" onClick={resetBurner}>🔄 New Wallet</button>
            <button className="exportBtn" onClick={exportVoteLogs}>📥 Export Votes</button>
          </>
        ) : (
          <p>ℹ️ No candidates found.</p>
        )}

        {/* 📊 Live Vote Count */}
        {Object.keys(voteCounts).length > 0 && (
          <div className="results" data-aos="fade-up">
            <h3>📊 Live Vote Tally</h3>
            <ul>
              {Object.entries(voteCounts).map(([name, count]) => (
                <li key={name} className={votedFor === name ? 'votedSelf' : ''}>
                  {name}: {count} vote(s) {votedFor === name && <span>✅</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ⛳ Result Message */}
        {message && (
          <div className={`message ${message.startsWith('✅') ? 'success' : message.startsWith('❌') ? 'error' : ''}`}>
            {message}
          </div>
        )}
      </section>
    </div>
  );
}

export default App;