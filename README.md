# epi-data

## Understanding the environment variables

Environment variables should never be checked into the repository!

PORT= (internal port the app will listen on (doesn't have to match the docker port))

HOST=(the PROOF host where the form data resides)

FORM_SERIES=(internal form identifier)

API_KEY=(the API key provided to access the form data)

USERNAME=(the username used to secure the endpoint)

PASSWORD=(the password used to download data - this can also be added to the docker run cmd)


## Building the container image

```bash
docker build -t epi-data.
```
## Running the container in production

docker run -p <external_port>:<internal_port> -e password=<password> --restart=on-failure epi-data

```bash
docker run -p <external_port>:<internal_port> -e password=a-really-strong-password --restart=on-failure epi-data
```
