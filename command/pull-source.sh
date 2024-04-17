#!/bin/bash

# skip SSH yes/no
export GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=no"

# Change to that directory
cd {{local_path}} || exit

# start agent
eval "$(ssh-agent -s)"

# add git account private key
ssh-add {{path_to_private_key}}

# set account
git remote set-url origin {{ssh_url}}

# check out branch
git checkout {{branch}}

# Pull the latest changes from Git
git pull
