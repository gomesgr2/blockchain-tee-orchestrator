variable "prefix" {
  description = "A prefix used for naming resources."
}

variable "location" {
  description = "Azure region for deployment."
}

variable "resource_group_name" {
  description = "Resource group name"
  default     = "pgc-resources"
}

variable "public_key_ssh" {
  description = "Public key for SSH access"
}

variable "sgx_driver_distro_name" {
  description = "Distro name for URL to download SGX driver"
  default     = "ubuntu20.04-server"
}

variable "sgx_driver_file_name" {
  description = "Filename for URL to download SGX driver"
  default     = "sgx_linux_x64_driver_2.11.54c9c4c.bin"
}

variable "subnet_id" {
  description = "Subnet ID"
}

variable "account_index" {
  description = "Index da conta utilizada pela máquina SGX"
  default     = 0
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
  default = [false, false, false]
}

variable "number_untrusted_containers" {
  description = "Numero de containers nao confiaveis a gerar"
  type        = number
}

variable "tee_code_image" {
  description = "The name of the TEE code image"
  default     = "gabriel2011/tee-code"
}

