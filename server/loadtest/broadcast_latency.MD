Settings:
LT_ROOMS = 20
LT_CLIENTS_PER_ROOM = 10
LT_DURATION_MS = 15000
LT_TRANSPORTS = websocket
LT_RUNS = 5

BEFORE OPTIMISTIC BROADCAST OPTIMIZATION
=== Broadcast-latency baseline ===
runs                5
transports          websocket
rooms x clients     20 x 10 = 200 sockets
connect failures    0
note:create emitted 1400
broadcasts received 14000
pooled samples      14000
per-run p50 spread  53.8ms – 57.0ms
pooled latency:
  p50  55.2ms
  p95  205.1ms
  p99  252.2ms
  max  272.0ms
broadcast throughput 186.7/s

AFTER OPTIMISTIC BROADCAST OPTIMIZATION
=== Broadcast-latency baseline ===
runs                5
transports          websocket
rooms x clients     20 x 10 = 200 sockets
connect failures    0
note:create emitted 1400
broadcasts received 14000
pooled samples      14000
per-run p50 spread  4.9ms – 6.2ms
pooled latency:
  p50  5.5ms
  p95  9.5ms
  p99  14.1ms
  max  16.1ms
broadcast throughput 186.7/s

90% 

