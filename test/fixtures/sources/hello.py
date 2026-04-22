class Greeter:
    def __init__(self, name: str) -> None:
        self.name = name

    def greet(self) -> str:
        return f"Hello, {self.name}!"


def main() -> None:
    print(Greeter("world").greet())


if __name__ == "__main__":
    main()
