# Image for the extraction jobs on Railway (build context: repo root).
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1
WORKDIR /app
RUN pip install --no-cache-dir duckdb==2.0.0 \
 && python -c "import duckdb; duckdb.sql('INSTALL httpfs')"
COPY 1-extract_data/src/common.py 1-extract_data/src/archives.py 1-extract_data/src/api.py src/
# EXTRACT_SCRIPT picks the job: archives.py (yearly archives) or api.py (area API)
CMD ["sh", "-c", "python src/${EXTRACT_SCRIPT:-api.py} --dest \"$EXTRACT_DEST\" $EXTRACT_ARGS"]
