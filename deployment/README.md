# Amazon Web Services Deployment

Deployment is driven by [Terraform](https://terraform.io/) and the [AWS Command Line Interface](http://aws.amazon.com/cli/). It requires some setup in your Amazon account, editing a configuration file, and creating Amazon resources.

## Dependencies

Install [Terraform](https://terraform.io) using the steps detailed on the project website.

## Configure an AWS Profile using the AWS CLI

Using the AWS CLI, create an AWS profile:

```bash
$ aws --profile transit configure
AWS Access Key ID [****************F2DQ]:
AWS Secret Access Key [****************TLJ/]:
Default region name [us-east-1]: us-east-1
Default output format [None]:
```

You will be prompted to enter your AWS credentials, along with a default region. These credentials will be used to authenticate calls to the AWS API when using Packer, Terraform, and the AWS CLI.

## Terraform

Next, use Terraform to lookup the remote state of the infrastructure and assemble a plan for work to be done:

```bash
$ AWS_DEFAULT_REGION="us-east-1" AWS_PROFILE="transit" ./scripts/terraform-plan.sh
```

Once the plan has been assembled, and you agree with the changes, apply it:

```bash
$ AWS_DEFAULT_REGION="us-east-1" AWS_PROFILE="transit" ./scripts/terraform-apply.sh
```

This will attempt to apply the plan assembled in the previous step using Amazon's APIs. In order to change specific attributes of the infrastructure, inspect the contents of `deployment/terraform/terraform.tfvars`.
