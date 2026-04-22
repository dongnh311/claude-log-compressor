pub struct Greeter {
    name: String,
}

impl Greeter {
    pub fn new(name: &str) -> Self {
        Self { name: name.to_string() }
    }

    pub fn greet(&self) -> String {
        format!("Hello, {}!", self.name)
    }
}

fn main() {
    let g = Greeter::new("world");
    println!("{}", g.greet());
}
