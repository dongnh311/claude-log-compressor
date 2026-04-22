class HelloGreeter {
  constructor(name) { this.name = name; }
  greet() { return `Hello, ${this.name}!`; }
}

console.log(new HelloGreeter("world").greet());
