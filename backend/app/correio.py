"""Envio de e-mail. Sem SMTP configurado, a mensagem vai para o log (útil em desenvolvimento)."""

import logging
import smtplib
import ssl
from email.message import EmailMessage

from .config import Settings

log = logging.getLogger(__name__)


def enviar_email(settings: Settings, para: str, assunto: str, corpo: str) -> None:
    if not settings.smtp_host:
        log.warning(
            "SMTP não configurado; e-mail para %s não enviado.\n%s\n\n%s", para, assunto, corpo
        )
        return

    msg = EmailMessage()
    msg["From"] = settings.smtp_remetente
    msg["To"] = para
    msg["Subject"] = assunto
    msg.set_content(corpo)

    contexto = ssl.create_default_context()
    if settings.smtp_seguranca == "ssl":
        servidor = smtplib.SMTP_SSL(
            settings.smtp_host, settings.smtp_porta, context=contexto, timeout=20
        )
    else:
        servidor = smtplib.SMTP(settings.smtp_host, settings.smtp_porta, timeout=20)
    with servidor:
        if settings.smtp_seguranca == "starttls":
            servidor.starttls(context=contexto)
        if settings.smtp_usuario:
            servidor.login(settings.smtp_usuario, settings.smtp_senha or "")
        servidor.send_message(msg)
