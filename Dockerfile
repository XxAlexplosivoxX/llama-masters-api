# Static, cgo-free build (modernc SQLite) on a distroless base.
FROM golang:1.27.4 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/llama-api ./cmd/llama-api && mkdir /out/data

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/llama-api /llama-api
# The nonroot user (65532) must own the database folder, including fresh volumes.
COPY --from=build --chown=65532:65532 /out/data /data
ENV ADDR=:8080 DB_PATH=/data/llama.db
VOLUME /data
EXPOSE 8080
ENTRYPOINT ["/llama-api"]
CMD ["serve"]
