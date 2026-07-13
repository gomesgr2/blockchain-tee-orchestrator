resource "azurerm_linux_virtual_machine" "vm_sgx" {
  name                = "${var.prefix}-vm-sgx-${var.account_index}"
  location            = var.location
  resource_group_name = var.resource_group_name
  size                = "Standard_DC1ds_v3"
  priority            = "Spot"
  eviction_policy     = "Deallocate"

  admin_username = "ubuntu"

  os_disk {
    name          = "${var.prefix}-osdisk-sgx-${var.account_index}"
    caching       = "ReadWrite"
    storage_account_type = "Standard_LRS"
  }

  source_image_reference {
    publisher = "Canonical"
    offer     = "0001-com-ubuntu-server-focal"
    sku       = "20_04-lts-gen2"
    version   = "latest"
  }

  custom_data = base64encode(<<-CUSTOM_DATA
    #!/bin/bash
    set -e

    # ── 1. Install Docker ────────────────────────────────────────────
    apt-get update -y
    apt-get install -y docker.io python3-pip
    systemctl enable docker          # survive reboots
    systemctl start docker

    # ── 2. Pull & run TEE container ─────────────────────────────────
    docker pull ${var.tee_code_image}

    docker run -d \
      --name tee-code \
      --restart always \
      -p 9090:9090 \
      --device /dev/sgx_enclave \
      --device /dev/sgx_provision \
      --security-opt seccomp=unconfined \
      ${var.tee_code_image}

    # ── 3. Systemd service — ensures container restarts after Spot   ──
    #        eviction / deallocation even if cloud-init doesn't re-run
    cat > /etc/systemd/system/tee-code.service <<'EOF'
    [Unit]
    Description=TEE go Docker container
    After=docker.service
    Requires=docker.service

    [Service]
    Restart=always
    ExecStart=/usr/bin/docker start -a tee-code
    ExecStop=/usr/bin/docker stop tee-code

    [Install]
    WantedBy=multi-user.target
    EOF

    systemctl daemon-reload
    systemctl enable tee-code.service

    CUSTOM_DATA
  )


  admin_ssh_key {
    username   = "ubuntu"
    public_key = var.public_key_ssh
  }

  network_interface_ids = [azurerm_network_interface.ni_sgx.id]
}
