import React, { useCallback, useEffect, useState } from "react";
import { JsonRpcProvider, Wallet, Contract, parseEther } from "ethers";
import AOS from "aos";
import "aos/dist/aos.css";
import "./App.css";
import VotingABI from "./abi/VotingABI.json";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import confetti from "canvas-confetti";
import deployed from "./deployedAddress.json";

import Particles from "react-tsparticles";
import { loadSlim } from "tsparticles-slim";
import particleConfig from "./particles";

const CONTRACT_ADDRESS = deployed.address;
const FUNDER_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

function App() {
  const [wallet, setWallet] = useState(null);
  const [provider, setProvider] = useState(null);
  const [contract, setContract] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [selectedCandidate, setSelectedCandidate] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [voteCounts, setVoteCounts] = useState({});
  const [theme, setTheme] = useState("dark");

  // Voter ID logic
  const [voterId, setVoterId] = useState("");
  const [addressHasVoted, setAddressHasVoted] = useState(false);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", nextTheme);
    setTheme(nextTheme);
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    AOS.init({ duration: 1000, once: true });
  }, [theme]);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        setIsLoading(true);
        const provider = new JsonRpcProvider("http://127.0.0.1:8545");
        if (mounted) setProvider(provider);

        let storedPk = localStorage.getItem("burnerPrivateKey");
        let burner =
          storedPk && storedPk.length > 0
            ? new Wallet(storedPk).connect(provider)
            : Wallet.createRandom().connect(provider);

        if (!storedPk) {
          localStorage.setItem("burnerPrivateKey", burner.privateKey);
        }

        const balance = await provider.getBalance(burner.address);
        if (balance.toString() === "0") {
          const funder = new Wallet(FUNDER_PRIVATE_KEY, provider);
          const tx = await funder.sendTransaction({
            to: burner.address,
            value: parseEther("0.01"),
          });
          await tx.wait();
        }

        const contract = new Contract(CONTRACT_ADDRESS, VotingABI, burner);
        const list = await contract.getCandidates();

        if (mounted) {
          setWallet(burner);
          setContract(contract);
          setCandidates(list);
        }
      } catch (err) {
        setMessage("❌ Initialization failed");
      } finally {
        setIsLoading(false);
      }
    };

    init();
    return () => {
      mounted = false;
    };
  }, []);

  // Check if this wallet has already voted
  useEffect(() => {
    const checkAddressVoted = async () => {
      if (contract && wallet) {
        try {
          const voted = await contract.hasAddressVoted(wallet.address);
          setAddressHasVoted(voted);
        } catch {
          setAddressHasVoted(false);
        }
      }
    };
    checkAddressVoted();
  }, [contract, wallet]);

  useEffect(() => {
    if (contract && candidates.length > 0) {
      fetchVoteCounts();
    }
    // eslint-disable-next-line
  }, [contract, candidates]);

  const fetchVoteCounts = async () => {
    try {
      const result = {};
      for (const name of candidates) {
        const count = await contract.getVotes(name);
        result[name] = count.toString();
      }
      setVoteCounts(result);
    } catch (err) {
      // Optionally handle error
    }
  };

  // Input validation
  const isVoterIdValid = (id) => /^[a-zA-Z0-9_-]{3,32}$/.test(id);

  // Only check voter status when voting is attempted
  const handleVote = async () => {
    if (addressHasVoted) {
      setMessage("❌ This wallet has already voted.");
      return;
    }
    if (!voterId) {
      setMessage("❌ Please enter your Voter ID.");
      return;
    }
    if (!isVoterIdValid(voterId)) {
      setMessage("❌ Voter ID must be 3-32 letters, numbers, _ or -.");
      return;
    }
    if (!selectedCandidate) {
      setMessage("❌ Please select a candidate.");
      return;
    }
    try {
      setMessage("⏳ Checking voter status...");
      const reg = await contract.isVoterIdRegistered(voterId);
      const voted = await contract.hasVoterIdVotedFn(voterId);

      if (!reg) {
        setMessage("❌ This Voter ID is not registered.");
        return;
      }
      if (voted) {
        setMessage("❌ This Voter ID has already voted.");
        return;
      }

      setMessage("⏳ Submitting vote...");
      const tx = await contract.vote(voterId, selectedCandidate);
      await tx.wait();

      confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
      setMessage(`✅ Voted for "${selectedCandidate}" successfully!`);
      setAddressHasVoted(true);
      await fetchVoteCounts();
    } catch (err) {
      if (err.message && err.message.includes("This wallet has already voted")) {
        setMessage("❌ This wallet has already voted.");
        setAddressHasVoted(true);
      } else if (err.message && err.message.includes("Not a registered voter ID")) {
        setMessage("❌ This Voter ID is not registered.");
      } else if (err.message && err.message.includes("already voted")) {
        setMessage("❌ This Voter ID has already voted.");
      } else if (err.message && err.message.includes("Invalid candidate")) {
        setMessage("❌ Invalid candidate.");
      } else {
        setMessage(`❌ ${err.message || "Vote failed"}`);
      }
    }
  };

  // Allow pressing Enter in the Voter ID input to trigger voting
  const handleVoterIdKeyDown = (e) => {
    if (e.key === "Enter") {
      handleVote();
    }
  };

  // Reset burner wallet
  const resetBurner = () => {
    localStorage.removeItem("burnerPrivateKey");
    window.location.reload();
  };

  // Export logs (fetches all blocks for demo; for large chains, batch or range)
  const exportVoteLogs = async () => {
    try {
      const latestBlock = await provider.getBlockNumber();
      const logs = await contract.queryFilter(contract.filters.VoteCast(), 0, latestBlock);

      const finalData = [];

      for (let log of logs) {
        const { args, blockNumber, transactionHash } = log;
        const voterIdHash = args.voterIdHash;
        const candidate = args.candidate;

        const [receipt, block] = await Promise.all([
          provider.getTransactionReceipt(transactionHash),
          provider.getBlock(blockNumber),
        ]);

        finalData.push({
          "Voter ID Hash": voterIdHash,
          Candidate: candidate,
          "Transaction Hash": transactionHash,
          "Block Number": blockNumber,
          Timestamp: new Date(block.timestamp * 1000).toLocaleString(),
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
      setMessage("❌ Export failed");
    }
  };

  const initParticles = useCallback(async (engine) => {
    await loadSlim(engine);
  }, []);

  return (
    <div className="container">
      <Particles id="tsparticles" init={initParticles} options={particleConfig} className="particles" />

      <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
        {theme === "dark" ? "🌞 Light Mode" : "🌙 Dark Mode"}
      </button>

      <header>
        <h1 className="accent">Blockchain Voting</h1>
        <p>
          Transparent. Secure. On-Chain.
          <br />
          Vote confidently with Web3.
        </p>
      </header>

      <section className="voteBox" data-aos="fade-up">
        {wallet && (
          <div className="wallet" aria-label="Connected wallet">
            <strong>Wallet:</strong>
            <br />
            {wallet.address}
          </div>
        )}

        {isLoading ? (
          <p>⏳ Loading...</p>
        ) : (
          <>
            <label htmlFor="voter-id-input">Enter Your Voter ID</label>
            <input
              id="voter-id-input"
              type="text"
              placeholder="e.g. student001"
              value={voterId}
              onChange={e => {
                setVoterId(e.target.value);
                setMessage(""); // clear message on change
              }}
              onKeyDown={handleVoterIdKeyDown}
              aria-label="Voter ID"
              disabled={addressHasVoted}
            />

            {addressHasVoted && (
              <div className="message error" role="alert">
                ❌ This wallet has already voted.
              </div>
            )}

            {candidates.length > 0 ? (
              <>
                <label htmlFor="candidate-select">Select Candidate</label>
                <select
                  id="candidate-select"
                  value={selectedCandidate}
                  onChange={(e) => setSelectedCandidate(e.target.value)}
                  aria-label="Candidate selection"
                  disabled={addressHasVoted}
                >
                  <option disabled value="">
                    ⬇️ Select
                  </option>
                  {candidates.map((name, idx) => (
                    <option key={idx} value={name}>
                      {name}
                    </option>
                  ))}
                </select>

                <div className="button-group">
                  <button
                    onClick={handleVote}
                    disabled={
                      !selectedCandidate ||
                      !voterId ||
                      addressHasVoted
                    }
                    aria-label="Vote"
                  >
                    ✅ Vote
                  </button>
                  <button className="exportBtn" onClick={exportVoteLogs} aria-label="Export votes">
                    📥 Export
                  </button>
                  <button className="resetBtn" onClick={resetBurner} aria-label="Reset wallet">
                    🔄 Reset Wallet
                  </button>
                </div>
              </>
            ) : (
              <p>ℹ️ No candidates found.</p>
            )}
          </>
        )}

        {/* Live Voting Count Area */}
        <div className="results" data-aos="fade-up">
          <h3>📊 Live Vote Tally</h3>
          <ul className="vote-tally-list">
            {candidates.map((name, idx) => (
              <li
                key={idx}
                className="vote-tally-item"
              >
                <span className="candidate-name">{name}</span>
                <span className="vote-count">
                  {voteCounts[name] ?? "0"}{" "}
                  <span className="vote-label">
                    vote{(voteCounts[name] ?? "0") === "1" ? "" : "s"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {message && (
          <div
            className={`message ${
              message.startsWith("✅") ? "success" : message.startsWith("❌") ? "error" : ""
            }`}
            role="alert"
          >
            {message}
          </div>
        )}
      </section>

      <footer>
        Built with ❤️ by{" "}
        <a
          href="https://github.com/protonexe"
          target="_blank"
          rel="noreferrer"
          style={{ color: "var(--accent)", textDecoration: "underline" }}
        >
          protonexe
        </a>
      </footer>
    </div>
  );
}

export default App;