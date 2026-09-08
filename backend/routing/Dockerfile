# syntax=docker/dockerfile:1
#
# Servicio de rutas: A* sobre el grafo vial de Cartagena.
# Contexto de build: ./backend  (necesita routing/ y data/carreteras.geojson)

FROM python:3.11-slim AS build
WORKDIR /srv
COPY routing/requirements.txt routing/requirements.txt
RUN pip install --no-cache-dir -r routing/requirements.txt
COPY routing ./routing
COPY data/carreteras.geojson ./data/carreteras.geojson
# Construye el grafo (.pkl, ~12 MB) desde el geojson versionado. Igual que el
# buildCommand de render.yaml; se hornea en la imagen para que el arranque solo
# tenga que despickelar.
RUN python routing/graph_builder.py

FROM python:3.11-slim
WORKDIR /srv
ENV PYTHONUNBUFFERED=1 PORT=4002
COPY --from=build /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=build /usr/local/bin /usr/local/bin
COPY --from=build /srv/routing ./routing
COPY --from=build /srv/data ./data
WORKDIR /srv/routing
EXPOSE 4002
CMD ["sh", "-c", "uvicorn routing_service:app --host 0.0.0.0 --port ${PORT:-4002}"]
