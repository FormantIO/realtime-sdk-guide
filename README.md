### Running the custom web view

In the repo's root,

`yarn install` to install depdendencies.

`yarn start` to run the app in development mode.

Configure a custom web view in Formant with the url `http://localhost:3000/?auth={auth}&device={device_id}` to use this app inside Formant.

The page will reload if you make edits.

### Running the complementary python adapter

`python3 -m pip install -r requirements.txt`

`python3 adapter.py`

### Optional text-to-speech dependency

`sudo apt install espeak`
