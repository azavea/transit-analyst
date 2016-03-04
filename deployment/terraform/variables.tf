variable "aws_region" {
  default = "us-east-1"
}

variable "aws_availability_zones" {
}

variable "aws_key_name" {
}

variable "inbound_cidr" {
}

variable "vpc_id" {
}

variable "vpc_cidr" {
}

variable "vpc_subnets" {
}

variable "app_ami" {
}

variable "app_instance_type" {
}

variable "app_desired_capacity" {
  default = 1
}

variable "app_min_asg_size" {
  default = 1
}

variable "app_max_asg_size" {
  default = 1
}

variable "app_min_elb_capacity" {
  default = 1
}