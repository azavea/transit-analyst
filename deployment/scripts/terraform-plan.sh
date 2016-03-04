#!/usr/bin/env bash

set -e

if env | grep -q "TA_DEPLOY_DEBUG"; then
    set -x
fi

LOCAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TERRAFORM_DIR="${LOCAL_DIR}/../../deployment/terraform"

pushd "${TERRAFORM_DIR}"

terraform remote config \
          -backend="s3" \
          -backend-config="bucket=com.azavea.transitanalyst.terraform" \
          -backend-config="key=state" \
          -backend-config="encrypt=true"

terraform get -update
terraform plan -input=false "$@"
