#!/usr/bin/env bash
set -e

apt-get update -y
apt-get install -y ffmpeg

pip install -r requirements.txt
