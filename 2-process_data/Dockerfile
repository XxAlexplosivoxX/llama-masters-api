# Image for the processing jobs on Railway (build context: repo root).
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1
WORKDIR /app
RUN pip install --no-cache-dir duckdb==2.0.0 numpy==2.5.4 shapely==2.2.0 \
 && python -c "import duckdb; duckdb.sql('INSTALL httpfs; INSTALL spatial')"
COPY 2-process_data/src/ src/
# PROCESS_SCRIPT: the stage, or stages run in order with the same arguments (workers: "clean.py aggregate.py");
# PROCESS_ROOT is the bucket root, e.g. r2://llama-masters-firms
CMD ["sh", "-c", "for s in ${PROCESS_SCRIPT:-clean.py}; do python src/$s --root \"$PROCESS_ROOT\" $PROCESS_ARGS || exit 1; done"]
