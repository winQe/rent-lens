resource "aws_db_subnet_group" "main" {
  name       = local.name
  subnet_ids = aws_subnet.private[*].id
}

# No statement_timeout here: it would also apply to the ingest and migrations, which run long
# statements. The API sets its own 10 s limit on each connection.
resource "aws_db_parameter_group" "main" {
  name   = local.name
  family = "postgres17"

  # The percentile aggregates push the planner's cost estimate over jit_above_cost, and JIT
  # compiling then takes about 100 ms for a query that runs in about 7 ms.
  parameter {
    name  = "jit"
    value = "0"
  }
}

# RDS writes PostgreSQL logs here. Declared so it gets the same retention as the other log groups;
# left to RDS, it would keep logs forever.
resource "aws_cloudwatch_log_group" "rds" {
  name              = "/aws/rds/instance/${local.name}/postgresql"
  retention_in_days = var.log_retention_days
}

resource "aws_db_instance" "main" {
  identifier     = local.name
  engine         = "postgres"
  engine_version = "17"
  instance_class = var.db_instance_class

  allocated_storage     = var.db_allocated_storage_gb
  max_allocated_storage = var.db_max_allocated_storage_gb
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = "rentlens"
  username = "rentlens"
  # RDS creates the password and keeps it in Secrets Manager; it never appears in Terraform state.
  manage_master_user_password = true

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]
  parameter_group_name   = aws_db_parameter_group.main.name
  publicly_accessible    = false
  multi_az               = var.db_multi_az

  backup_retention_period    = 7
  backup_window              = "18:00-19:00" # 02:00 to 03:00 in Singapore
  maintenance_window         = "sun:19:00-sun:20:00"
  auto_minor_version_upgrade = true
  copy_tags_to_snapshot      = true

  deletion_protection       = var.db_deletion_protection
  skip_final_snapshot       = false
  final_snapshot_identifier = "${local.name}-final"

  enabled_cloudwatch_logs_exports = ["postgresql"]

  depends_on = [aws_cloudwatch_log_group.rds]
}
