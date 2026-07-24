#!/usr/bin/env bash
# Build the console image and push it to Amazon ECR.
# Usage: ECR_ACCOUNT=123456789012 AWS_REGION=us-east-1 ./deploy/push-to-ecr.sh [tag]
set -euo pipefail

region="${AWS_REGION:-us-east-1}"
account="${ECR_ACCOUNT:?set ECR_ACCOUNT to your AWS account id}"
repo="${ECR_REPO:-askledger/console}"
tag="${1:-latest}"

registry="${account}.dkr.ecr.${region}.amazonaws.com"
image="${registry}/${repo}:${tag}"

echo "building ${image}"
docker build -t "${image}" ./console

# create the repo the first time only
if ! aws ecr describe-repositories --repository-names "${repo}" --region "${region}" >/dev/null 2>&1; then
  aws ecr create-repository --repository-name "${repo}" --region "${region}" >/dev/null
fi

echo "logging in"
aws ecr get-login-password --region "${region}" | docker login --username AWS --password-stdin "${registry}"

echo "pushing"
docker push "${image}"

echo "done: ${image}"
