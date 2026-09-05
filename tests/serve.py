"""Loopback-only static server for concurrent browser tests, never production."""

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class TestHTTPServer(ThreadingHTTPServer):
    # Multiple browser contexts open many asset connections during reloads.
    # The default queue of five can reset a queued app.js request on macOS.
    request_queue_size = 128


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("port", type=int)
    parser.add_argument("--directory", default=".")
    args = parser.parse_args()
    handler = partial(SimpleHTTPRequestHandler, directory=args.directory)
    with TestHTTPServer(("127.0.0.1", args.port), handler) as server:
        server.serve_forever()
