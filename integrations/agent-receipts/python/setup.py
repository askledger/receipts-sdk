from setuptools import setup, find_packages

setup(
    name="askledger-agents",
    version="0.1.0",
    description="AskLedger receipts for AutoGen, CrewAI, Pydantic AI, smolagents",
    license="Apache-2.0",
    packages=find_packages(),
    python_requires=">=3.10",
    classifiers=[
        "License :: OSI Approved :: Apache Software License",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
    ],
    url="https://github.com/askledger/receipts-sdk",
)
