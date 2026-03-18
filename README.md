# Blockchain-TEE Orchestrator

<img width="1025" height="578" alt="Captura de tela de 2026-03-17 21-40-50" src="https://github.com/user-attachments/assets/11f16475-4b05-4b66-aeec-5931a5c1e5b1" />


A research prototype for **secure distributed computation using Blockchain and Trusted Execution Environments (TEE)**.

This project implements a **blockchain-orchestrated architecture** where smart contracts coordinate the execution of tasks across trusted compute clusters.

The system combines:

- **Blockchain** for orchestration and auditability  
- **Trusted Execution Environments (TEE)** for confidential computation  
- **Distributed task managers** for high availability and workload distribution  

The goal is to provide a **verifiable and secure execution pipeline for distributed applications**.

---

# Research Context

This project was developed as part of a **Bachelor Thesis in Computer Science** at:

**Universidade Federal do ABC (UFABC)**

Research topic:

**Blockchain-TEE Architecture for Secure Application Execution**

The work investigates how blockchain technology can be used as a **control plane for secure distributed computation**.

---

# Motivation

Distributed systems typically rely on centralized schedulers and load balancers to coordinate computational workloads. This introduces challenges related to:

- trust in execution
- auditability of processing
- transparency of scheduling decisions
- security of sensitive computations

This project explores an alternative approach where a **blockchain network acts as a trusted coordination layer**, enabling secure and verifiable task orchestration across compute nodes running inside **Trusted Execution Environments**.

---
## Client Applications

Applications submit computation requests to the system.

---

## Task Managers

Task Managers are responsible for:

- receiving computation requests
- interacting with the blockchain smart contracts
- dispatching tasks to compute nodes
- collecting and returning results

Task Managers are deployed across **multiple availability zones** to ensure high availability.

---

## Blockchain Layer

The blockchain acts as a **trusted orchestration and verification layer**.

Smart contracts manage:

- task manager registration
- workload routing
- execution tracking
- verification of processing nodes

This ensures that all execution decisions are **transparent and immutable**.

---

## Trusted Execution Environment (TEE)

Compute nodes run workloads inside **Trusted Execution Environments**, such as Intel SGX.

TEEs provide:

- secure enclave execution
- data confidentiality
- code integrity
- protection against host compromise

This allows sensitive computations to run securely even in distributed environments.

---

# System Workflow

1. A client submits a computation request.
2. A Task Manager receives the request.
3. The Task Manager interacts with the blockchain smart contract.
4. The blockchain determines which compute cluster should process the request.
5. The task is dispatched to a TEE node.
6. The computation is executed inside a secure enclave.
7. The result is returned and the execution is recorded on-chain.

---

# Prototype Implementation

Current prototype components:

- **Ethereum Smart Contracts**
- **Ganache local blockchain network**
- **Task Manager service**
- **TEE-enabled compute nodes**
- **Azure infrastructure deployment**

The blockchain is used as a **trusted coordination layer**, ensuring that task execution can be audited and verified.

---

# Key Features

- Blockchain-based task orchestration  
- Secure execution using Trusted Execution Environments  
- Immutable logging of task execution  
- Distributed task manager architecture  
- Multi-zone deployment for high availability  

---

# Future Improvements

Possible extensions of this architecture include:

- TEE remote attestation verification
- dynamic load-aware scheduling
- integration with Kubernetes clusters
- performance benchmarking and scalability evaluation
- decentralized reputation systems for compute nodes

---

# License

MIT License
