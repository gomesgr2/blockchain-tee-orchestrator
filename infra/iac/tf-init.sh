#!/usr/bin/env bash
set -euo pipefail

echo
echo "Exporting TF_VARs and running terraform init..."
echo "Entering interactive shell with TF_VARs exported. Run 'exit' to leave."
# If a .env file exists, source it and export TF_VARs for service principal auth.
ENV_FILE=".env"
if [ -f "$ENV_FILE" ]; then
			echo "Loading credentials from $ENV_FILE"
			# Parse .env manually: trim whitespace, ignore comments, strip quotes
			while IFS= read -r line || [ -n "$line" ]; do
				# Trim leading/trailing whitespace
				line="$(printf '%s' "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
				# Skip blank lines and comments
				case "$line" in
					''|\#*) continue ;;
				esac
				if printf '%s' "$line" | grep -q '='; then
					key="$(printf '%s' "$line" | cut -d= -f1)"
					val="$(printf '%s' "$line" | cut -d= -f2-)"
					key="$(printf '%s' "$key" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
					val="$(printf '%s' "$val" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
										# Remove surrounding double or single quotes (safe)
										if [[ "${val:0:1}" == '"' && "${val: -1}" == '"' ]]; then
											val="${val:1:${#val}-2}"
										fi
										if [[ "${val:0:1}" == "'" && "${val: -1}" == "'" ]]; then
											val="${val:1:${#val}-2}"
										fi
					export "$key"="$val"
				fi
			done < "$ENV_FILE"

			# Map AZURE_ variables to TF_VAR_ if present
			if [ -n "${AZURE_CLIENT_ID:-}" ]; then
				export TF_VAR_azure_client_id="$AZURE_CLIENT_ID"
			fi
			if [ -n "${AZURE_CLIENT_SECRET:-}" ]; then
				export TF_VAR_azure_client_secret="$AZURE_CLIENT_SECRET"
			fi
			if [ -n "${AZURE_TENANT_ID:-}" ]; then
				export TF_VAR_azure_tenant_id="$AZURE_TENANT_ID"
			fi
			if [ -n "${AZURE_SUBSCRIPTION_ID:-}" ]; then
				export TF_VAR_azure_subscription_id="$AZURE_SUBSCRIPTION_ID"
			fi
else
	echo ".env not found. You can create one from .env.example or use Azure CLI authentication."
	read -p "Use Azure CLI ('az login') for authentication? [Y/n]: " USE_AZ_CLI
	USE_AZ_CLI=${USE_AZ_CLI:-Y}

	if [[ "$USE_AZ_CLI" =~ ^([yY][eE][sS]|[yY])$ ]]; then
		echo "Opening browser to authenticate with Azure CLI..."
		az login
		echo "Available subscriptions:"
		az account list --output table
		read -p "Enter subscription id to set (leave empty to keep current): " SUB_ID
		if [ -n "$SUB_ID" ]; then
			az account set --subscription "$SUB_ID"
		fi
	else
		read -p "Azure Client ID: " AZ_CLIENT_ID
		read -s -p "Azure Client Secret: " AZ_CLIENT_SECRET
		echo
		read -p "Azure Tenant ID: " AZ_TENANT_ID
		read -p "Azure Subscription ID: " AZ_SUBSCRIPTION_ID

		echo "Exporting TF_VARs for service principal auth..."
		export TF_VAR_azure_client_id="$AZ_CLIENT_ID"
		export TF_VAR_azure_client_secret="$AZ_CLIENT_SECRET"
		export TF_VAR_azure_tenant_id="$AZ_TENANT_ID"
		export TF_VAR_azure_subscription_id="$AZ_SUBSCRIPTION_ID"
	fi
fi

# Initialize and validate terraform in this directory
terraform init
terraform validate || true

# Drop to an interactive shell with the environment available
echo "Entering interactive shell. TF environment available. Run 'exit' to leave."
exec bash
