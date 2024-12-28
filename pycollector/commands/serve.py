from typing import Callable, Any
import socket
import json

from argparse import ArgumentParser, Namespace

from ..base_command import BaseCommand, register


class ServeCommand(BaseCommand):

    def __init__(self) -> None:
        super().__init__("serve")

        self._commands: dict[str, Callable[[socket.socket, dict[str, Any]], None]] = {
            "vectorize": self.vectorize,
            "vectorize-with-text": self.vectorize_with_text,
            "status": self.status_cmd,
            "nearest-neighbors": self.nearest_neighbors,
            "vectorize-text": self.vectorize_text
        }

    def get_parser(self) -> ArgumentParser:
        parser = super().get_parser()
        parser.add_argument("-p", "--port",  type=int)
        parser.add_argument("--init", action="store_true")

        return parser

    def nearest_neighbors(self, conn: socket.socket, request: dict[str, Any]):
        from .. import nearest_neighbors

        file = request.get("file", None)
        if not file:
            return conn.sendall(json.dumps({"error": "File not specified"}).encode())
        
        number = request.get("number", 5) or 5

        result = nearest_neighbors.find(file, number)
        conn.sendall(json.dumps({"nearest": result}).encode())

    def status_cmd(self, conn: socket.socket, request: dict[str, Any]):
        conn.sendall(json.dumps({"status": "running"}).encode())

    def vectorize(self, conn: socket.socket, request: dict[str, Any]):
        from .. import core
        from .. import core_tf
        file = request.get("file", None)
        if not file:
            return conn.sendall(json.dumps({"error": "File not specified"}).encode())
        
        # assume that this is a list of string
        text = request.get("text", None)

        with core.DownloadOrLocalImage(file) as img:
            result, _ = core_tf.vectorize_with_text(img, text)

        return conn.sendall(json.dumps({"vector": result.tolist()}).encode())

    def vectorize_with_text(self, conn: socket.socket, request: dict[str, Any]):
        from .. import core
        from .. import core_tf
        file = request.get("file", None)
        if not file:
            return conn.sendall(json.dumps({"error": "File not specified"}).encode())

        with core.DownloadOrLocalImage(file) as img:
            result, texts = core_tf.vectorize_with_text(img)

        return conn.sendall(json.dumps({"vector": result.tolist(), "text": texts}).encode())

    def vectorize_text(self, conn: socket.socket, request: dict[str, Any]):
        from .. import core
        text = request.get("text", None)
        if not text:
            return conn.sendall(json.dumps({"error": "No Text Specified"}).encode())
        
        result = core.encode_text(text)
        if result is None:
            return conn.sendall(json.dumps({"error": "Invalid text"}).encode())
        return conn.sendall(json.dumps({"vector": result.tolist()}).encode())

    def process(self, conn: socket.socket):
        try:
            received: dict = json.loads(conn.recv(1024))
        except Exception as e:
            response = {"error": f"Invalid packet: {e}"}
            return conn.sendall(json.dumps(response).encode())

        if not (command := received.get("command", None)):
            response = {"error": "Command not specified"}
            return conn.sendall(json.dumps(response).encode())

        if not (to_run := self._commands.get(command, None)):
            response = {"error": f"Invalid command: {command}"}
            return conn.sendall(json.dumps(response).encode())
        
        try:
            to_run(conn, received)
        except Exception as e:
            response = {"error": str(e)}
            conn.sendall(json.dumps(response).encode())

    def run(self, namespace: Namespace):
        if namespace.port:
            port = namespace.port
        else:
            port = 19999

        if namespace.init:
            # initialize here
            from .. import core_tf

        print(f"Python is listenning on port: {port}", flush=True)
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.bind(("127.0.0.1", port))
        sock.listen()
        while True:
            conn, addr = sock.accept()
            with conn:
                self.process(conn)


register(ServeCommand())
