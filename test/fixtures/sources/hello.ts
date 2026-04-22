export interface Greeter {
  greet(): string;
}

export class HelloGreeter implements Greeter {
  constructor(private name: string) {}
  greet(): string {
    return `Hello, ${this.name}!`;
  }
}

console.log(new HelloGreeter("world").greet());
