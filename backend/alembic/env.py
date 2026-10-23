from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine

from app.config import get_settings
from app.models import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

# Quem chama (CLI ou testes) pode passar outra URL; senão vale a do .env.
url = config.attributes.get("database_url") or get_settings().database_url

with create_engine(url).connect() as conexao:
    context.configure(connection=conexao, target_metadata=Base.metadata)
    with context.begin_transaction():
        context.run_migrations()
