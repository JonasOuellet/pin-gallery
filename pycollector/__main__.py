import argparse
import sys

from .base_command import _init_commands, get_command_by_name, list_commands

parser = argparse.ArgumentParser(
    "pycollector",
    "pycollecter [OPTIONS...] CMD [CMD OPTIONS...]",
    add_help=False
)
parser.add_argument("cmd", nargs='?')
parser.add_argument('-h', '--help', action='store_true')


if __name__ == "__main__":
    # check for the command name
    parsed, unparsed = parser.parse_known_args()

    if parsed.help:
        if parsed.cmd:
            _init_commands()
            if command := get_command_by_name(parsed.cmd):
                unparsed.append("--help")
                command.get_parser().parse_args(unparsed)
                sys.exit(0)

        parser.print_usage()
        print()
        print("Global Options:")
        print("    -h, --help   show this message or information about the command")
        print()
        print('Use "pycollector list" to list all the available command')
    else:
        if not parsed.cmd:
            print("Command not specified.")
            parser.print_usage()
            sys.exit(1)

        _init_commands()
        if command := get_command_by_name(parsed.cmd):
            parser = command.get_parser()
            ns = parser.parse_args(unparsed)
            command.run(ns)
        else:
            print(f"Invalid command: {parsed.cmd}")
            print("Here's a list of valid commands:")
            for cmd in list_commands():
                print("   ", cmd)
