FROM gramineproject/gramine:1.9-jammy

# ── 1. Install Python and dependencies ──────────────────────────────────────
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

COPY ./app /app
RUN pip3 install --no-cache-dir -r /app/requirements.txt

# ── 2. Gramine manifest and entrypoint ──────────────────────────────────────
WORKDIR /gramine
COPY python.manifest.template /gramine/python.manifest.template
COPY entrypoint.sh /gramine/entrypoint.sh
RUN chmod +x /gramine/entrypoint.sh

# ── 3. Generate signing key and build SGX manifest ─────────────────────────
RUN gramine-sgx-gen-private-key enclave-key.pem

RUN gramine-manifest \
    -Dlog_level=error \
    -Darch_libdir=/lib/x86_64-linux-gnu \
    python.manifest.template > python.manifest

RUN gramine-sgx-sign \
    --key enclave-key.pem \
    --manifest python.manifest \
    --output python.manifest.sgx

EXPOSE 9090

ENTRYPOINT ["/gramine/entrypoint.sh"]
