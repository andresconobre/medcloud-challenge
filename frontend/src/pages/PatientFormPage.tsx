import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded'
import SaveRoundedIcon from '@mui/icons-material/SaveRounded'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  CircularProgress,
  Container,
  Divider,
  FormControlLabel,
  Grid,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useFormik } from 'formik'
import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import * as yup from 'yup'
import { useFeedback } from '../contexts/feedback-context'
import { cepService } from '../services/cepService'
import { patientsService } from '../services/patientsService'
import type { Patient, PatientPayload } from '../types/patient'
import { getErrorMessage, getFieldErrorMap } from '../utils/httpError'

type PatientFormValues = PatientPayload & {
  address: PatientPayload['address'] & {
    hasNoNumber: boolean
  }
}

const initialValues: PatientFormValues = {
  name: '',
  birthDate: '',
  email: '',
  address: {
    cep: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
    hasNoNumber: false,
  },
}

const validationSchema = yup.object({
  name: yup.string().trim().required('Nome obrigatório'),
  birthDate: yup
    .string()
    .required('Data de nascimento obrigatória')
    .matches(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato YYYY-MM-DD')
    .test('valid-date', 'Data de nascimento inválida', (value) => {
      if (!value) return false
      const parsedDate = new Date(`${value}T00:00:00.000Z`)
      return !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().startsWith(value)
    })
    .test('past-date', 'Data de nascimento não pode estar no futuro', (value) => {
      if (!value) return false
      return new Date(`${value}T00:00:00.000Z`) <= new Date()
    })
    .test('min-year', 'Data de nascimento deve ter ano maior ou igual a 1900', (value) => {
      if (!value) return false
      return Number(value.slice(0, 4)) >= 1900
    }),
  email: yup.string().trim().email('E-mail inválido').required('E-mail obrigatório'),
  address: yup.object({
    cep: yup
      .string()
      .trim()
      .matches(/^\d{5}-?\d{3}$/, 'CEP inválido')
      .required('CEP obrigatório'),
    street: yup.string().trim().required('Rua obrigatória'),
    hasNoNumber: yup.boolean().required(),
    number: yup.string().trim().when('hasNoNumber', {
      is: true,
      then: (schema) => schema.notRequired(),
      otherwise: (schema) => schema.required('Número obrigatório'),
    }),
    complement: yup.string().trim().optional(),
    neighborhood: yup.string().trim().required('Bairro obrigatório'),
    city: yup.string().trim().required('Cidade obrigatória'),
    state: yup
      .string()
      .trim()
      .min(2, 'Estado obrigatório')
      .max(2, 'Use a sigla do estado')
      .required('Estado obrigatório'),
  }),
})

function getFieldError(touched: unknown, errors: unknown) {
  const wasTouched = Boolean(touched)
  const error = typeof errors === 'string' ? errors : undefined

  return {
    error: wasTouched && Boolean(error),
    helperText: wasTouched ? error : undefined,
  }
}

function formatCep(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8)

  if (digits.length <= 5) {
    return digits
  }

  return `${digits.slice(0, 5)}-${digits.slice(5)}`
}

export function PatientFormPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { pushFeedback } = useFeedback()
  const { id } = useParams<{ id: string }>()
  const patientId = id ?? ''
  const isEditMode = Boolean(id)
  const patientFromNavigation = (location.state as { patient?: Patient } | null)?.patient
  const [loadingPatient, setLoadingPatient] = useState(isEditMode)
  const [pageError, setPageError] = useState('')
  const [isFetchingCep, setIsFetchingCep] = useState(false)

  const pageTitle = useMemo(
    () => (isEditMode ? 'Editar paciente' : 'Cadastrar paciente'),
    [isEditMode],
  )

  function createNavigationFeedback(message: string, severity: 'success' | 'error' | 'info' | 'warning') {
    return {
      id: Date.now() + Math.floor(Math.random() * 1000),
      message,
      severity,
    }
  }

  const formik = useFormik<PatientFormValues>({
    initialValues,
    validationSchema,
    validateOnMount: true,
    onSubmit: async (values, helpers) => {
      try {
        const payload: PatientPayload = {
          name: values.name.trim(),
          birthDate: values.birthDate,
          email: values.email.trim(),
          address: {
            cep: values.address.cep.trim(),
            street: values.address.street.trim(),
            number: values.address.number.trim(),
            complement: values.address.complement?.trim() ?? '',
            neighborhood: values.address.neighborhood.trim(),
            city: values.address.city.trim(),
            state: values.address.state.trim().toUpperCase(),
          },
        }

        if (isEditMode) {
          await patientsService.update(patientId, payload)
          navigate('/', {
            state: {
              feedback: createNavigationFeedback('Paciente atualizado com sucesso', 'success'),
            },
          })
        } else {
          await patientsService.create(payload)
          navigate('/', {
            state: {
              feedback: createNavigationFeedback('Paciente cadastrado com sucesso', 'success'),
            },
          })
        }
      } catch (error) {
        console.error(error)
        const fieldErrors = getFieldErrorMap(error)
        const entries = Object.entries(fieldErrors)

        if (entries.length > 0) {
          entries.forEach(([field, message]) => {
            formik.setFieldError(field, message)
            formik.setFieldTouched(field, true, false)
          })
        } else {
          pushFeedback(getErrorMessage(error, 'Não foi possível salvar os dados do paciente'), 'error')
        }
      } finally {
        helpers.setSubmitting(false)
      }
    },
  })

  useEffect(() => {
    if (!isEditMode) {
      setLoadingPatient(false)
      return
    }

    if (patientFromNavigation && patientFromNavigation.id === patientId) {
        formik.setValues({
          name: patientFromNavigation.name,
          birthDate: patientFromNavigation.birthDate,
          email: patientFromNavigation.email,
          address: {
            cep: patientFromNavigation.address.cep,
            street: patientFromNavigation.address.street,
            number: patientFromNavigation.address.number,
            complement: patientFromNavigation.address.complement ?? '',
            neighborhood: patientFromNavigation.address.neighborhood,
            city: patientFromNavigation.address.city,
            state: patientFromNavigation.address.state,
            hasNoNumber: patientFromNavigation.address.number === 'S/N',
        },
      })
      setLoadingPatient(false)
      return
    }

    async function loadPatient() {
      try {
        setLoadingPatient(true)
        setPageError('')

        const patient = await patientsService.getById(patientId)
        formik.setValues({
          name: patient.name,
          birthDate: patient.birthDate,
          email: patient.email,
          address: {
            cep: patient.address.cep,
            street: patient.address.street,
            number: patient.address.number,
            complement: patient.address.complement ?? '',
            neighborhood: patient.address.neighborhood,
            city: patient.address.city,
            state: patient.address.state,
            hasNoNumber: patient.address.number === 'S/N',
          },
        })
      } catch (error) {
        console.error(error)
        setPageError(getErrorMessage(error, 'Não foi possível carregar o paciente para edição'))
      } finally {
        setLoadingPatient(false)
      }
    }

    void loadPatient()
  }, [formik.setValues, isEditMode, patientFromNavigation, patientId])

  async function handleCepBlur() {
    formik.handleBlur({
      target: {
        name: 'address.cep',
      },
    } as React.FocusEvent<HTMLInputElement>)

    const normalizedCep = formik.values.address.cep.replace(/\D/g, '')

    if (normalizedCep.length !== 8) {
      return
    }

    try {
      setIsFetchingCep(true)
      const address = await cepService.getAddressByCep(normalizedCep)

      await formik.setFieldValue('address.cep', address.cep)
      await formik.setFieldValue('address.street', address.street)
      await formik.setFieldValue('address.complement', address.complement ?? '')
      await formik.setFieldValue('address.neighborhood', address.neighborhood)
      await formik.setFieldValue('address.city', address.city)
      await formik.setFieldValue('address.state', address.state)
    } catch (error) {
      console.error(error)
      pushFeedback(getErrorMessage(error, 'Não foi possível buscar o endereço pelo CEP'), 'error')
    } finally {
      setIsFetchingCep(false)
    }
  }

  function handleCepChange(event: ChangeEvent<HTMLInputElement>) {
    formik.setFieldValue('address.cep', formatCep(event.target.value))
  }

  function handleNoNumberChange(event: ChangeEvent<HTMLInputElement>) {
    const checked = event.target.checked
    formik.setFieldValue('address.hasNoNumber', checked)
    formik.setFieldTouched('address.hasNoNumber', true, false)

    if (checked) {
      formik.setFieldValue('address.number', 'S/N')
      formik.setFieldTouched('address.number', true, false)
    } else if (formik.values.address.number === 'S/N') {
      formik.setFieldValue('address.number', '')
      formik.setFieldTouched('address.number', false, false)
    }
  }

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Stack spacing={3}>
        <Stack
          direction={{ xs: 'column-reverse', sm: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          gap={2}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h4" component="h1" gutterBottom>
              {pageTitle}
            </Typography>
            <Typography color="text.secondary">
              Preencha os dados de identificação e endereço do paciente.
            </Typography>
          </Box>

          <Button
            variant="text"
            startIcon={<ArrowBackRoundedIcon />}
            onClick={() => navigate('/')}
            sx={{ alignSelf: { xs: 'stretch', sm: 'flex-start' } }}
          >
            Voltar para a lista
          </Button>
        </Stack>

        {loadingPatient ? (
          <Card sx={{ borderRadius: 2 }}>
            <CardContent sx={{ py: 8 }}>
              <Box display="flex" justifyContent="center">
                <CircularProgress />
              </Box>
            </CardContent>
          </Card>
        ) : pageError ? (
          <Alert severity="error">{pageError}</Alert>
        ) : (
          <Card
            sx={{
              borderRadius: 2,
              bgcolor: 'rgba(255,255,255,0.92)',
              boxShadow: '0 20px 50px rgba(13, 74, 109, 0.08)',
              backdropFilter: 'blur(10px)',
            }}
          >
            <CardContent sx={{ p: { xs: 3, md: 4 } }}>
              <Stack component="form" spacing={4} onSubmit={formik.handleSubmit}>
                <Box>
                  <Typography variant="h5" gutterBottom>
                    Dados pessoais
                  </Typography>
                  <Typography color="text.secondary">
                    Informações básicas para identificação do paciente no sistema.
                  </Typography>
                </Box>

                <Grid container spacing={2.5}>
                  <Grid size={{ xs: 12 }}>
                    <TextField
                      label="Nome completo"
                      name="name"
                      value={formik.values.name}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      {...getFieldError(formik.touched.name, formik.errors.name)}
                    />
                  </Grid>

                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      label="Data de nascimento"
                      name="birthDate"
                      type="date"
                      value={formik.values.birthDate}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      InputLabelProps={{ shrink: true }}
                      {...getFieldError(formik.touched.birthDate, formik.errors.birthDate)}
                    />
                  </Grid>

                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      label="E-mail"
                      name="email"
                      type="email"
                      value={formik.values.email}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      {...getFieldError(formik.touched.email, formik.errors.email)}
                    />
                  </Grid>
                </Grid>

                <Divider />

                <Box>
                  <Typography variant="h5" gutterBottom>
                    Endereço
                  </Typography>
                  <Typography color="text.secondary">
                    Dados de localização para contato e referência do cadastro.
                  </Typography>
                </Box>

                <Grid container spacing={2.5}>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <TextField
                      label="CEP"
                      name="address.cep"
                      value={formik.values.address.cep}
                      onChange={handleCepChange}
                      onBlur={handleCepBlur}
                      disabled={isFetchingCep}
                      placeholder="00000-000"
                      {...getFieldError(formik.touched.address?.cep, formik.errors.address?.cep)}
                    />
                  </Grid>

                  <Grid size={{ xs: 12, md: 8 }}>
                    <TextField
                      label="Rua"
                      name="address.street"
                      value={formik.values.address.street}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      disabled={isFetchingCep}
                      {...getFieldError(formik.touched.address?.street, formik.errors.address?.street)}
                    />
                  </Grid>

                  <Grid size={{ xs: 12, md: 3 }}>
                    <TextField
                      label="Número"
                      name="address.number"
                      value={formik.values.address.number}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      disabled={isFetchingCep || formik.values.address.hasNoNumber}
                      {...getFieldError(formik.touched.address?.number, formik.errors.address?.number)}
                    />
                  </Grid>

                  <Grid size={{ xs: 12, md: 9 }}>
                    <TextField
                      label="Complemento"
                      name="address.complement"
                      value={formik.values.address.complement ?? ''}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      disabled={isFetchingCep}
                      {...getFieldError(
                        formik.touched.address?.complement,
                        formik.errors.address?.complement,
                      )}
                    />
                  </Grid>

                  <Grid size={{ xs: 12 }}>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={formik.values.address.hasNoNumber}
                          onChange={handleNoNumberChange}
                          name="address.hasNoNumber"
                          disabled={isFetchingCep}
                        />
                      }
                      label="Endereço sem número"
                    />
                  </Grid>

                  <Grid size={{ xs: 12, md: 5 }}>
                    <TextField
                      label="Bairro"
                      name="address.neighborhood"
                      value={formik.values.address.neighborhood}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      disabled={isFetchingCep}
                      {...getFieldError(
                        formik.touched.address?.neighborhood,
                        formik.errors.address?.neighborhood,
                      )}
                    />
                  </Grid>

                  <Grid size={{ xs: 12, md: 5 }}>
                    <TextField
                      label="Cidade"
                      name="address.city"
                      value={formik.values.address.city}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      disabled={isFetchingCep}
                      {...getFieldError(formik.touched.address?.city, formik.errors.address?.city)}
                    />
                  </Grid>

                  <Grid size={{ xs: 12, md: 2 }}>
                    <TextField
                      label="UF"
                      name="address.state"
                      value={formik.values.address.state}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      disabled={isFetchingCep}
                      inputProps={{ maxLength: 2 }}
                      {...getFieldError(formik.touched.address?.state, formik.errors.address?.state)}
                    />
                  </Grid>
                </Grid>

                <Box
                  display="flex"
                  justifyContent={{ xs: 'center', sm: 'flex-end' }}
                  flexWrap="wrap"
                  gap={2}
                  pt={1}
                >
                  <Button
                    variant="outlined"
                    onClick={() => navigate('/')}
                    sx={{
                      borderColor: 'rgba(204, 75, 75, 0.24)',
                      color: '#b04444',
                      bgcolor: 'rgba(204, 75, 75, 0.06)',
                      '&:hover': {
                        borderColor: '#b04444',
                        bgcolor: 'rgba(204, 75, 75, 0.12)',
                      },
                    }}
                  >
                    Cancelar
                  </Button>

                  <Button
                    type="submit"
                    variant="contained"
                    startIcon={<SaveRoundedIcon />}
                    disabled={formik.isSubmitting || !formik.dirty || !formik.isValid}
                    sx={{
                      textAlign: 'center',
                      bgcolor: 'primary.main',
                      color: '#ffffff',
                      '&:hover': {
                        bgcolor: 'primary.dark',
                      },
                      '&.Mui-disabled': {
                        bgcolor: 'rgba(0, 179, 173, 0.28)',
                        color: 'rgba(255,255,255,0.82)',
                      },
                    }}
                  >
                    {formik.isSubmitting ? 'Salvando...' : isEditMode ? 'Salvar alterações' : 'Cadastrar paciente'}
                  </Button>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        )}
      </Stack>
    </Container>
  )
}
