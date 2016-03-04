aws_availability_zones = "us-east-1c,us-east-1d"
aws_key_name = "otp-transit-analyst"

inbound_cidr = "96.93.19.137/32"

vpc_id = "vpc-9853e6fd"
vpc_cidr = "172.30.0.0/16"
vpc_subnets = "subnet-65fc2912,subnet-c4f3049d"

app_ami = "ami-6d2a1107"
app_instance_type = "m4.xlarge"
app_desired_capacity = "2"
app_min_asg_size = "2"
app_max_asg_size = "5"
app_min_elb_capacity = "2"
