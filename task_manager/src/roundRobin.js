// roundRobin.js
class RoundRobin {
    constructor(targets) {
        this.targets = targets; // Lista de IPs das TEEs (ex: ['tee-1', 'tee-2'])
        this.currentIndex = 0;
    }

    getNext() {
        if (this.targets.length === 0) return null;
        
        const target = this.targets[this.currentIndex];
        // Move para o próximo e reseta se chegar ao fim
        this.currentIndex = (this.currentIndex + 1) % this.targets.length;
        return target;
    }
    
    // Caso uma TEE caia no health check, atualizamos a lista
    updateTargets(newTargets) {
        this.targets = newTargets;
        if (this.currentIndex >= this.targets.length) {
            this.currentIndex = 0;
        }
    }
}

module.exports = RoundRobin;