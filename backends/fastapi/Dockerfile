FROM python:3.13-slim

WORKDIR /app

# Install deps first so code changes do not reinstall the world.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Run as non-root. Least privilege applies to processes too.
RUN useradd --uid 10001 --no-create-home appuser
USER appuser

EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/health', timeout=2)" || exit 1

# One Uvicorn worker per container; scale by running more containers behind the gateway.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
