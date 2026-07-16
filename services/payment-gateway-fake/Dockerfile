# Stdlib only, so there is nothing to pip install and the image stays small.
FROM python:3.14-slim

WORKDIR /app
COPY app.py .

# Run as a non-root user. Even a fake gateway gets least privilege.
RUN useradd --uid 10001 --no-create-home appuser
USER appuser

EXPOSE 9090
HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:9090/health', timeout=2)" || exit 1

CMD ["python", "app.py"]
