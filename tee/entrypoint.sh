#!/bin/bash
set -e

cd /gramine

if [ -e /dev/sgx_enclave ] || [ -e /dev/sgx/enclave ]; then
    echo "[TEE] SGX hardware detected — launching with gramine-sgx"
    gramine-sgx python
else
    echo "[TEE] No SGX hardware — launching with gramine-direct (simulation)"
    gramine-direct python
fi
