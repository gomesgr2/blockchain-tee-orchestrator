variable "prefix" {
  description = "A prefix used for naming resources."
}

variable "location" {
  description = "Azure region for deployment."
}

variable "task_manager_size" {
  description = "VM size for task managers"
  default     = "Standard_D2s_v3"
}

variable "resource_group_name" {
  description = "Resource group name"
  default     = "pgc-resources"
}

variable "public_key_ssh" {
  description = "Public key for SSH access"
}

variable "dockerhub_image_sgx" {
  description = "Docker image for SGX instance."
  default     = "yanalmeida91/sgx-blockchain-pull:latest"
}

variable "dockerhub_image_sgx_untrusted" {
  description = "Docker image for untrusted SGX instance run."
  default     = "yanalmeida91/sgx-untrusted-blockchain-pull:ganache"
}

variable "dockerhub_image_nginx" {
  description = "Docker image for nginx repository."
  default = "yanalmeida91/nginx-file-repo:latest"
}

variable "contract_abi" {
  description = "ABI do contrato inteligente"
  default     = "[]"
}

variable "contract_address" {
  description = "Endereço do contrato inteligente"
  default     = ""
}

variable "number_machines" {
  description = "Numero de maquinas a criar"
  default     = 3
}

variable "enclave_key_path" {
  description = "Caminho para o arquivo contendo o enclave-key.pem"
}

variable "manifest_path" {
  description = "Caminho para o arquivo contendo o manifesto"
}

variable "generate_public_ip" {
  description = "Se deve ou não gerar ip publico para as máquinas"
  type        = list(bool)
  default     = [false, false, false]
}

variable "task_manager_count" {
  description = "Number of Task Manager VMs to create (one per region by default)."
  type        = number
  default     = 2
}

variable "task_manager_location_list" {
  description = "Default locations for the two task managers (region1 and region2)."
  type        = list(string)
  default     = ["westus2", "eastus2"]
}

variable "location_list" {
  description = "Optional list of Azure regions per machine."
  type        = list(string)
  default     = ["westus2", "westus2", "eastus2"]
}

variable "allowed_ssh_cidrs" {
  description = "List of CIDRs allowed for SSH (22)."
  type        = list(string)
  default     = []
}

variable "allow_8545_from" {
  description = "List of CIDRs allowed to access Ganache RPC on port 8545."
  type        = list(string)
  default     = []
}

variable "azure_client_id" {
  description = "Azure Client ID"
  type        = string
  sensitive   = true
}

variable "azure_client_secret" {
  description = "Azure Client Secret"
  type        = string
  sensitive   = true
}

variable "azure_tenant_id" {
  description = "Azure Tenant ID"
  type        = string
  sensitive   = true
}

variable "azure_subscription_id" {
  description = "Azure Subscription ID"
  type        = string
  sensitive   = true
}

variable "storage_account_name" {
  description = "Nome globalmente único para o Azure Storage Account"
  type        = string
  default     = "pgcfilesrepo"
}

variable "tms_private_keys" {
  description = "Lista de chaves privadas para as Task Managers"
  type        = list(string)
  sensitive   = true
  default     = []
}

variable "task_manager_image" {
  description = "Docker image for the task-manager service"
  default     = "gabriel2011/task-manager"
}

variable "dockerhub_image_blockchain" {
  description = "Docker image for blockchain instance."
  default     = "yanalmeida91/ganache-smart-contract:latest"
}

variable "number_untrusted_containers" {
  description = "Numero de containers destrincados"
  type        = number
  default     = 0
}

variable "generate_public_ip_defaults" {
  description = "Helper default list for public IP generation"
  type        = list(bool)
  default     = [false, false, false]
}

variable "blockchain_vm_size" {
  description = "VM size for blockchain"
  default     = "Standard_B1s"
}
