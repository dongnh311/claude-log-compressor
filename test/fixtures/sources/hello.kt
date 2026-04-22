package com.example

class Greeter(val name: String) {
    fun greet(): String = "Hello, $name!"
}

fun main() {
    val g = Greeter("world")
    println(g.greet())
}
