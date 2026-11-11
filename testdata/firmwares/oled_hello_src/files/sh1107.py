"""
SH1107 driver for Waveshare Pico-OLED-1.3 (128x64, 4-wire SPI).

Adapted from Waveshare Pico_code MicroPython sample.
Pinout: DIN=GP11, CLK=GP10, CS=GP9, DC=GP8, RST=GP12
"""

from machine import Pin, SPI
import framebuf
import time

DC = 8
RST = 12
MOSI = 11
SCK = 10
CS = 9


class PicoOled13(framebuf.FrameBuffer):
    def __init__(self):
        self.width = 128
        self.height = 64

        self.cs = Pin(CS, Pin.OUT)
        self.rst = Pin(RST, Pin.OUT)
        self.cs(1)
        self.spi = SPI(
            1,
            20_000_000,
            polarity=0,
            phase=0,
            sck=Pin(SCK),
            mosi=Pin(MOSI),
            miso=None,
        )
        self.dc = Pin(DC, Pin.OUT)
        self.dc(1)
        self.buffer = bytearray(self.height * self.width // 8)
        super().__init__(self.buffer, self.width, self.height, framebuf.MONO_HMSB)
        self.init_display()
        self.white = 1
        self.black = 0

    def write_cmd(self, cmd):
        self.cs(1)
        self.dc(0)
        self.cs(0)
        self.spi.write(bytearray([cmd]))
        self.cs(1)

    def write_data(self, buf):
        self.cs(1)
        self.dc(1)
        self.cs(0)
        self.spi.write(bytearray([buf]))
        self.cs(1)

    def init_display(self):
        self.rst(1)
        time.sleep(0.001)
        self.rst(0)
        time.sleep(0.01)
        self.rst(1)

        self.write_cmd(0xAE)
        self.write_cmd(0x00)
        self.write_cmd(0x10)
        self.write_cmd(0xB0)
        self.write_cmd(0xDC)
        self.write_cmd(0x00)
        self.write_cmd(0x81)
        self.write_cmd(0xFF)  # max contrast (Waveshare default 0x6F is dim)
        self.write_cmd(0x21)
        self.write_cmd(0xA0)
        self.write_cmd(0xC0)
        self.write_cmd(0xA4)
        self.write_cmd(0xA6)
        self.write_cmd(0xA8)
        self.write_cmd(0x3F)
        self.write_cmd(0xD3)
        self.write_cmd(0x60)
        self.write_cmd(0xD5)
        self.write_cmd(0x41)
        self.write_cmd(0xD9)
        self.write_cmd(0x22)
        self.write_cmd(0xDB)
        self.write_cmd(0x35)
        self.write_cmd(0xAD)
        self.write_cmd(0x8A)
        self.write_cmd(0xAF)

    def show(self):
        # Waveshare mapping for this portrait SH1107 panel
        self.write_cmd(0xB0)
        for page in range(0, 64):
            column = 63 - page
            self.write_cmd(0x00 + (column & 0x0F))
            self.write_cmd(0x10 + (column >> 4))
            for num in range(0, 16):
                self.write_data(self.buffer[page * 16 + num])
