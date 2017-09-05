#!/usr/bin/env python
# -*- coding: utf-8 -*-
 
from setuptools import setup, find_packages
 
import Cleep
 
setup(
    name = 'cleepremote',
    version = cleep.__version__,
    packages = find_packages(),
    author = 'Tanguy Bonneau',
    author_email = 'tanguy.bonneau+raspiot@gmail.com',
    description = 'CleepDesktop python core',
    long_description = open('README.md').read(),
    install_requires = open('requirements.txt').readlines(),
    include_package_data = True,
    url = 'https://bitbucket.org/Tangb/CleepDesktop'
)

