FROM ghcr.io/astral-sh/uv:python3.11-alpine
ENV ENV_MODE production
WORKDIR /app
RUN apk add --no-cache curl git \
    freetype-dev \
    gcc \
    linux-headers \
    musl-dev \
    python3-dev \
    pango \
    cairo \
    gdk-pixbuf \
    libffi \
    fontconfig \
    ttf-dejavu \
    ttf-liberation
# Install Python dependencies
COPY pyproject.toml uv.lock ./
ENV UV_LINK_MODE=copy
RUN uv sync --locked --quiet
# Activate the virtual environment
ENV VIRTUAL_ENV=/app/.venv
ENV PATH="/app/.venv/bin:$PATH"
# Copy application code
COPY . .
ENV PYTHONPATH=/app
EXPOSE 8000
CMD ["sh", "-c", "gunicorn api:app -w ${WORKERS:-4} -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000 --timeout ${TIMEOUT:-75} --graceful-timeout 30 --keep-alive 65"]
