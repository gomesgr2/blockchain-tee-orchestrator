// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract smartContract {
    event JobDelegated(uint256 indexed jobId, address indexed targetManager, string fileUrl);

    struct Job {
        string fileUrl;
        address requester;    // TM do Cluster A
        address targetManager; // TM do Cluster B
        bool completed;
    }

    // Registro de Managers Autorizados (TMs de qualquer cluster)
    address[] public authorizedManagers;
    mapping(address => bool) public isRegistered;

    mapping(uint256 => Job) public jobs;
    uint256 public lastJobId;

    // O TM de qualquer cluster se registra aqui ao subir
    function registerManager() external {
        if(!isRegistered[msg.sender]) {
            isRegistered[msg.sender] = true;
            authorizedManagers.push(msg.sender);
        }
    }

    // TM1 (Cluster A) escolhe um manager da lista global sem conhecer seu IP
    function delegateToAny(uint256 _jobId, string calldata _url) external {
        require(isRegistered[msg.sender], "Nao autorizado");
        
        address target = findAvailableManager(msg.sender);
        require(target != address(0), "Nenhum outro Manager disponivel");

        // Gravamos usando o ID vindo do Task Manager
        jobs[_jobId] = Job(_url, msg.sender, target, false);
        
        emit JobDelegated(_jobId, target, _url);
    }

    function findAvailableManager(address _exclude) internal view returns (address) {
        for(uint i = 0; i < authorizedManagers.length; i++) {
            if(authorizedManagers[i] != _exclude) {
                return authorizedManagers[i];
            }
        }
        return address(0);
    }
}