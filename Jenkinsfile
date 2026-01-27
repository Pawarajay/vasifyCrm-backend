pipeline {
    agent any
    
    environment {
//         DEPLOY_CONFIG = readYaml file: 'deploy-config.yml'
//         DOCKER_IMAGE = "${DEPLOY_CONFIG.registry_image}:${BUILD_NUMBER}"
        ANSIBLE_DIR = '/opt/ansible'
    }

    stages {
//         stage('Checkout Pre') {
//           steps {
//             checkout scm
//           }
//         }

        stage('Init - load deploy.yml into env') {
          steps {
            script {
              def cfgFile = 'deploy-config.yml'
              if (!fileExists(cfgFile)) {
                error "deploy.yml not found in workspace"
              }
              def cfg = readYaml file: cfgFile
              echo "cfg.class = ${cfg.getClass().getName()}"
              echo "cfg.toString(): ${cfg.toString()}"
              // Print the object and its class
              env.APP_NAME       = cfg.app_name
              env.APP_PORT       = cfg.app_port.toString()
              env.HEALTH_CHECK_PATH= cfg.health_check_path
              env.NODE_ENV       = cfg.env
              env.DOMAIN         = cfg.domain
              env.TARGET_HOST    = cfg.target_host
              env.SSL_EMAIL      = cfg.ssl_email
              env.REGISTRY       = cfg.registry
              env.REGISTRY_IMAGE = cfg.registry_image
              env.DOCKER_IMAGE   = "${cfg.registry_image}:${BUILD_NUMBER}"
            }
          }
        }

        stage('Checkout') {
            steps {
                checkout scm
                echo "Building: ${APP_NAME}"
                echo "Domain: ${DOMAIN}"
            }
        }
        
        stage('Docker Build & Push') {
            steps {
                script {
                    docker.withRegistry("https://${env.REGISTRY}", 'gitlab-registry-credentials') {
                        def image = docker.build("${env.DOCKER_IMAGE}")
                        image.push()
                        image.push('latest')
                    }
                }
            }
        }
        
        stage('Deploy with Ansible') {
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'gitlab-registry-credentials',
                    usernameVariable: 'REGISTRY_USER',
                    passwordVariable: 'REGISTRY_PASS'
                )]) {
                    sh """
                        ansible-playbook -i ${ANSIBLE_DIR}/inventory.yml ${ANSIBLE_DIR}/deploy.yml \
                            -e "target_host=${TARGET_HOST}" \
                            -e "app_name=${APP_NAME}" \
                            -e "app_port=${APP_PORT}" \
                            -e "health_check_path=${HEALTH_CHECK_PATH}" \
                            -e "env=${NODE_ENV}" \
                            -e "domain=${DOMAIN}" \
                            -e "ssl_email=${SSL_EMAIL}" \
                            -e "docker_image=${DOCKER_IMAGE}" \
                            -e "registry=${REGISTRY}" \
                            -e "registry_user=${REGISTRY_USER}" \
                            -e "registry_pass=${REGISTRY_PASS}"
                    """
                }
            }
        }
    }
    
    post {
        success {
            echo "Deployed successfully to https://${DOMAIN}"
        }
        failure {
            echo "Deployment failed!"
        }
    }
}
