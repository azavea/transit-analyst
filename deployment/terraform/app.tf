provider "aws" {
  region = "${var.aws_region}"
}

resource "aws_sns_topic" "global" {
  name = "topicTransitAnalyst"
}

resource "aws_security_group" "app_elb" {
  vpc_id = "${var.vpc_id}"

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["${var.vpc_cidr}"]
  }

  tags {
    Name = "sgTransitAnalystAppServerLoadBalancer"
  }
}

resource "aws_security_group" "app" {
  vpc_id = "${var.vpc_id}"

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["${var.inbound_cidr}"]
  }

  ingress {
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    security_groups = ["${aws_security_group.app_elb.id}"]
  }

  egress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags {
    Name = "sgTransitAnalystAppServer"
  }
}

#
# Elastic Load Balancer resources
#
resource "aws_elb" "app" {
  security_groups = ["${aws_security_group.app_elb.id}"]
  subnets         = ["${split(",", var.vpc_subnets)}"]

  listener {
    instance_port     = 80
    instance_protocol = "http"
    lb_port           = 80
    lb_protocol       = "http"
  }

  health_check {
    healthy_threshold   = 3
    unhealthy_threshold = 2
    timeout             = 3
    target              = "HTTP:80/"
    interval            = 30
  }

  cross_zone_load_balancing   = true
  connection_draining         = true
  connection_draining_timeout = 300

  tags {
    Name = "elbTransitAnalystAppServer"
  }
}

resource "aws_lb_cookie_stickiness_policy" "app" {
  name = "transitanalyst-lb"
  load_balancer = "${aws_elb.app.id}"
  lb_port = 80
  cookie_expiration_period = 1200
}

#
# AutoScaling resources
#
resource "aws_launch_configuration" "app" {
  lifecycle {
    create_before_destroy = true
  }

  image_id             = "${var.app_ami}"
  instance_type        = "${var.app_instance_type}"
  key_name             = "${var.aws_key_name}"
  security_groups      = ["${aws_security_group.app.id}"]
}

resource "aws_autoscaling_group" "app" {
  lifecycle {
    create_before_destroy = true
  }

  # Explicitly linking ASG and launch configuration by name
  # to force replacement on launch configuration changes.
  name = "${aws_launch_configuration.app.name}"

  launch_configuration      = "${aws_launch_configuration.app.name}"
  health_check_grace_period = 600
  health_check_type         = "ELB"
  desired_capacity          = "${var.app_desired_capacity}"
  min_size                  = "${var.app_min_asg_size}"
  max_size                  = "${var.app_max_asg_size}"
  min_elb_capacity          = "${var.app_min_elb_capacity}"
  vpc_zone_identifier       = ["${split(",", var.vpc_subnets)}"]
  load_balancers            = ["${aws_elb.app.id}"]

  tag {
    key                 = "Name"
    value               = "TransitAnalystAppServer"
    propagate_at_launch = true
  }
}
