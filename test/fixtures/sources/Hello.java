package com.example;

public class Hello {
    private final String name;

    public Hello(String name) {
        this.name = name;
    }

    public String greet() {
        return "Hello, " + name + "!";
    }

    public static void main(String[] args) {
        System.out.println(new Hello("world").greet());
    }
}
